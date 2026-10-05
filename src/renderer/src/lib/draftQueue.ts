/** 同一页面的写入串行执行；提交会取消尚未发送的旧草稿。 */
export class DraftQueue<T, R> {
  private tail: Promise<unknown> = Promise.resolve()
  private pending = new Map<string, { value: T; timer: ReturnType<typeof setTimeout>; done: (error: unknown, result?: R) => void }>()

  constructor(private write: (value: T) => Promise<R>, private delay = 700) {}

  schedule(key: string, value: T, done: (error: unknown, result?: R) => void): void {
    this.cancel(key)
    const timer = setTimeout(() => { void this.flush(key) }, this.delay)
    this.pending.set(key, { value, timer, done })
  }

  private cancel(key: string): void {
    const task = this.pending.get(key)
    if (task) clearTimeout(task.timer)
    this.pending.delete(key)
  }

  private enqueue(value: T): Promise<R> {
    const result = this.tail.then(() => this.write(value))
    this.tail = result.catch(() => undefined)
    return result
  }

  async flush(key: string): Promise<void> {
    const task = this.pending.get(key)
    if (!task) { await this.tail; return }
    this.cancel(key)
    try { task.done(null, await this.enqueue(task.value)) }
    catch (error) { task.done(error) }
  }

  submit(key: string, value: T): Promise<R> {
    this.cancel(key)
    return this.enqueue(value)
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.pending.keys()].map((key) => this.flush(key)))
    await this.tail
  }
}
