# Dockerfile — 固化复现环境，保证"干净机器"可复现
FROM python:3.11-slim

ENV PYTHONHASHSEED=0 \
    MPLBACKEND=Agg \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8

# 系统依赖：中文字体 + LaTeX + 编译工具
RUN apt update && apt install -y --no-install-recommends \
        texlive-latex-extra \
        texlive-lang-chinese \
        fonts-noto-cjk \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
CMD ["bash", "reproduce/reproduce.sh"]
