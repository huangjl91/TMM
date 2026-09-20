"""沙箱执行器：由 Electron 主进程 spawn，不在仓库里直接运行。

协议：python runner.py <job.json>
job.json 需含 code / workspace / resultPath，可选 memMb。
执行结果写入 resultPath（JSON），stdout 保持干净。

限制手段：
1) Windows Job Object 限内存，超限由系统杀进程（CPU 时间限额见 apply_job_limits 注释）
2) sys.addaudithook 拦网络、子进程、危险模块与越目录写入
3) cwd 切进 workspace，相对路径天然落在工作区内
4) 墙钟超时由主进程 taskkill /T /F 兜底，覆盖死循环
"""

import base64
import contextlib
import io
import json
import os
import sys
import tempfile
import time
import traceback

ARTIFACT_EXT = {'.png', '.csv', '.txt', '.json', '.npz', '.xlsx', '.jpg'}
MAX_ARTIFACTS = 8
MAX_ARTIFACT_BYTES = 3_000_000
MAX_STREAM_CHARS = 200_000

# 导入黑名单只留" import 本身就是越权、且科学计算栈不会用到"的模块。
# matplotlib/__init__.py 在模块顶层 `import subprocess`，pandas 经由 pathlib 用 urllib.parse，
# numpy/pandas 还会 `import ctypes`，所以这些一律不能封导入；封了画图就废了。
# 真正的闸口是操作层：subprocess.Popen / socket.connect / ctypes.dlopen 的审计事件。
# 学生用 importlib 拿到模块对象也一样拦得住——审计钩子只看事件，不看调用方。
# 唯一拦不住的仍是 ctypes：runner 为建 Job Object 已把它放进 sys.modules，
# 而 CPython 对已缓存模块走快速路径、不发 import 事件。所以 ctypes 只在操作层
# （ctypes.dlopen）拦截，沙箱的定位是防跑飞/防误删/防联网，不是对抗蓄意逃逸。
DENY_MODULES = {
    'socketserver',
    'smtplib',
    'poplib',
    'imaplib',
    'ftplib',
    'telnetlib',
    'multiprocessing',
    'webbrowser',
    'oss2',
    'boto3',
}

_job_handle = None  # 持有引用，进程活着期间作业对象不能被关闭


def apply_job_limits(mem_mb):
    """把自己塞进 Job Object。返回实际生效的限额，便于上层如实报告。

    注意：CPU 时间限额在这里用不了——进程已被 Electron 的作业对象包了一层，
    嵌套作业设 PerProcessUserTimeLimit 会返回 err=87。死循环由主进程墙钟超时兜底。
    """
    applied = {'jobObject': False, 'memory': False, 'error': None}
    if sys.platform != 'win32':
        applied['error'] = '非 Windows，Job Object 不可用'
        return applied
    try:
        import ctypes
        from ctypes import wintypes

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [
                ('ReadOperationCount', ctypes.c_ulonglong),
                ('WriteOperationCount', ctypes.c_ulonglong),
                ('OtherOperationCount', ctypes.c_ulonglong),
                ('ReadTransferCount', ctypes.c_ulonglong),
                ('WriteTransferCount', ctypes.c_ulonglong),
                ('OtherTransferCount', ctypes.c_ulonglong),
            ]

        class BASIC_LIMITS(ctypes.Structure):
            _fields_ = [
                ('PerProcessUserTimeLimit', ctypes.c_longlong),
                ('PerJobUserTimeLimit', ctypes.c_longlong),
                ('LimitFlags', wintypes.DWORD),
                ('MinimumWorkingSetSize', ctypes.c_size_t),
                ('MaximumWorkingSetSize', ctypes.c_size_t),
                ('ActiveProcessLimit', wintypes.DWORD),
                ('Affinity', ctypes.c_size_t),
                ('PriorityClass', wintypes.DWORD),
                ('SchedulingClass', wintypes.DWORD),
            ]

        class EXTENDED_LIMITS(ctypes.Structure):
            _fields_ = [
                ('BasicLimitInformation', BASIC_LIMITS),
                ('IoInfo', IO_COUNTERS),
                ('ProcessMemoryLimit', ctypes.c_size_t),
                ('JobMemoryLimit', ctypes.c_size_t),
                ('PeakProcessMemoryUsed', ctypes.c_size_t),
                ('PeakJobMemoryUsed', ctypes.c_size_t),
            ]

        LIMIT_PROCESS_MEMORY = 0x00000100
        LIMIT_KILL_ON_CLOSE = 0x00002000
        JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9

        k32 = ctypes.WinDLL('kernel32', use_last_error=True)
        k32.CreateJobObjectW.restype = wintypes.HANDLE
        k32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        k32.GetCurrentProcess.restype = wintypes.HANDLE
        k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        k32.SetInformationJobObject.argtypes = [
            wintypes.HANDLE,
            ctypes.c_int,
            ctypes.c_void_p,
            wintypes.DWORD,
        ]

        global _job_handle
        _job_handle = k32.CreateJobObjectW(None, None)
        if not _job_handle:
            raise OSError('CreateJobObjectW 失败 err=%d' % ctypes.get_last_error())
        if not k32.AssignProcessToJobObject(_job_handle, k32.GetCurrentProcess()):
            raise OSError('AssignProcessToJobObject 失败 err=%d' % ctypes.get_last_error())

        info = EXTENDED_LIMITS()
        flags = LIMIT_KILL_ON_CLOSE
        if mem_mb and mem_mb > 0:
            info.ProcessMemoryLimit = int(mem_mb * 1024 * 1024)
            info.JobMemoryLimit = int(mem_mb * 1024 * 1024)
            flags |= LIMIT_PROCESS_MEMORY
            applied['memory'] = True
        info.BasicLimitInformation.LimitFlags = flags

        if not k32.SetInformationJobObject(
            _job_handle,
            JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
            ctypes.byref(info),
            ctypes.sizeof(info),
        ):
            raise OSError('SetInformationJobObject 失败 err=%d' % ctypes.get_last_error())
        applied['jobObject'] = True
    except Exception as e:  # noqa: BLE001 - 限额装不上必须显式上报，不能假装已隔离
        applied['error'] = '%s: %s' % (type(e).__name__, e)
    return applied


def inside(root, path):
    try:
        r = os.path.realpath(root)
        p = os.path.realpath(path)
    except Exception:  # noqa: BLE001
        return False
    return p == r or p.startswith(r + os.sep)


def install_audit_hook(workspace):
    write_roots = [workspace, tempfile.gettempdir()]

    def writable(path):
        return any(inside(root, path) for root in write_roots)

    def hook(event, args):
        if event == 'import':
            name = args[0] if args else ''
            top = str(name).split('.')[0]
            if top in DENY_MODULES:
                raise ImportError('沙箱禁止导入 %s（%s）' % (name, '网络/进程/文件系统类模块'))
            return
        if event in ('subprocess.Popen', 'os.system', 'os.exec', 'os.spawn', 'os.startfile'):
            raise PermissionError('沙箱禁止启动子进程或执行外部命令')
        if event in ('socket.connect', 'socket.connect_ex', 'socket.getaddrinfo',
                     'socket.sendto', 'socket.sendall'):
            raise PermissionError('沙箱禁止网络访问')
        # 实测 CPython 3.12 的 ctypes 审计事件是 dlopen/dlsym，没有"函数调用"这一层——
        # 拦住动态库加载就等价于让 ctypes 失去一切能力。
        if event.startswith('ctypes.'):
            raise PermissionError('沙箱禁止使用 ctypes（禁止加载动态库）')
        if event in ('os.remove', 'os.rename', 'os.truncate'):
            for p in args[:2]:
                if isinstance(p, (str, bytes, os.PathLike)) and not writable(os.fspath(p)):
                    raise PermissionError('沙箱禁止在工作区外删除或改名：%s' % os.fspath(p))
            return
        if event == 'open':
            target = args[0] if args else None
            mode = str(args[1]) if len(args) > 1 else ''
            if isinstance(target, int):
                return
            path = os.fspath(target)
            writing = any(c in mode for c in 'wax+') or '+' in mode
            if writing and not path.upper().startswith('\\\\.\\') and not writable(path):
                raise PermissionError('沙箱只能写入工作区与临时目录：%s' % path)

    sys.addaudithook(hook)


def snapshot_files(root):
    found = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != '.mplconfig']
        for fn in filenames:
            if fn.startswith('.mt-'):
                continue
            full = os.path.join(dirpath, fn)
            try:
                found[os.path.relpath(full, root).replace('\\', '/')] = os.path.getmtime(full)
            except OSError:
                continue
    return found


def collect_artifacts(root, before, started):
    out = []
    after = snapshot_files(root)
    for rel, mtime in after.items():
        if rel in before or mtime < started - 0.001:
            continue
        ext = os.path.splitext(rel)[1].lower()
        if ext not in ARTIFACT_EXT:
            continue
        full = os.path.join(root, rel.replace('/', os.sep))
        size = os.path.getsize(full)
        item = {'name': rel, 'ext': ext, 'size': size, 'inline': False}
        if ext in ('.png', '.jpg') and size <= MAX_ARTIFACT_BYTES and len(out) < MAX_ARTIFACTS:
            with open(full, 'rb') as f:
                mime = 'image/png' if ext == '.png' else 'image/jpeg'
                item['dataUrl'] = 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())
            item['inline'] = True
        out.append(item)
    return sorted(out, key=lambda a: a['name'])


def configure_matplotlib():
    import matplotlib

    matplotlib.use('Agg')
    import matplotlib.font_manager as fm
    from matplotlib import rcParams

    names = {f.name for f in fm.fontManager.ttflist}
    for cand in ('Microsoft YaHei', 'SimHei', 'Noto Sans CJK SC', 'SimSun'):
        if cand in names:
            rcParams['font.sans-serif'] = [cand, 'DejaVu Sans']
            break
    rcParams['axes.unicode_minus'] = False


def run(code, workspace):
    os.chdir(workspace)
    os.environ['MPLBACKEND'] = 'Agg'
    os.environ['MPLCONFIGDIR'] = os.path.join(workspace, '.mplconfig')
    sys.setrecursionlimit(6000)
    if 'matplotlib' in code:
        try:
            configure_matplotlib()
        except Exception:  # noqa: BLE001 - 字体配置失败不该阻断计算
            pass
    ns = {'__name__': '__main__', '__doc__': None}
    exec(compile(code, 'main.py', 'exec'), ns)


def main():
    job_path = os.path.abspath(sys.argv[1])
    with open(job_path, 'r', encoding='utf-8') as f:
        job = json.load(f)

    # run() 会 chdir 到 workspace，所以这里必须先全部绝对化
    workspace = os.path.abspath(job['workspace'])
    result_path = os.path.abspath(job['resultPath'])
    os.makedirs(workspace, exist_ok=True)
    started = time.time()

    limits = apply_job_limits(job.get('memMb', 1024))
    install_audit_hook(workspace)

    before = snapshot_files(workspace)
    out = io.StringIO()
    err = io.StringIO()
    ok = True
    error = None
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            run(job['code'], workspace)
    except BaseException as e:  # noqa: BLE001 - 学生代码的任何异常都要变成可读反馈
        ok = False
        tb = traceback.format_exc()
        error = {'type': type(e).__name__, 'message': str(e), 'traceback': tb[-4000:]}

    stdout = out.getvalue()[-MAX_STREAM_CHARS:]
    stderr = err.getvalue()[-MAX_STREAM_CHARS:]
    result = {
        'ok': ok,
        'error': error,
        'stdout': stdout,
        'stderr': stderr,
        'durationMs': int((time.time() - started) * 1000),
        'limits': limits,
        'artifacts': [],
    }
    try:
        result['artifacts'] = collect_artifacts(workspace, before, started)
    except Exception as e:  # noqa: BLE001
        result['artifactError'] = '%s: %s' % (type(e).__name__, e)

    with open(result_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)
    # 结果已落盘，用 0 退出让上层只看 result 文件
    sys.stdout = sys.__stdout__
    raise SystemExit(0)


if __name__ == '__main__':
    main()
