# ScreenRec

本地优先的桌面录屏工具（Windows 优先），基于 Electron 45 + Vite 8 + React 19 构建。
所有录制、转码、文件管理都在本机完成，不上传、不埋点。

## 功能

- **录屏来源**：整屏、单个窗口、自定义区域（整屏采集 + 画布裁剪）
- **音频**：系统声音（Windows loopback）+ 麦克风混音，系统音量与麦克风音量独立可调（0–200%），录制中可一键静音
- **外观**：亮色 / 暗色 / 跟随系统三种模式，7 种主题色，素材库、悬浮控制条与区域选择框同步生效
- **录制控制**：全局快捷键 `Ctrl + Alt + R`（macOS `Cmd + Shift + R`）、倒计时（倒计时中按 Esc 取消）、暂停/继续、停止并保存
- **录制中快捷键**：`Ctrl + Alt + P` 暂停/继续、`Ctrl + Alt + S` 停止、`Ctrl + Alt + M` 静音、`Ctrl + Alt + X` 取消；被其他程序占用时自动回退到 `Ctrl + Shift + …` 并提示
- **编码**：WebCodecs H.264（不可用时降级 VP9），音频 AAC / Opus，结果封装为 MP4
- **边录边落盘**：分片顺序写入 `recording.part.mp4`，崩溃或断电后可在素材库「修复并播放」
- **素材库**：缩略图、搜索、重命名、删除（进回收站）、在文件夹中显示、内置播放器
- **裁剪头尾**：在播放器里直接截掉开头/结尾，按关键帧对齐且不重编码（秒级精度）
- **导出**：原样复制 / 1080p / 720p 转码（内置 ffmpeg，用户无需安装）

## 开发

```bash
npm install
npm run dev        # 启动开发环境
npm run typecheck  # 类型检查（node + web 两套 tsconfig）
npm run build      # 产出 out/
npm run dist       # 打包安装包到 release/
```

录制文件默认保存到「视频/ScreenRec」，可在设置里修改。

## 目录结构

```
src/
  main/       主进程：窗口、IPC、录制会话、素材库、导出、媒体协议
  preload/    contextBridge 暴露 window.api / recorder / control / region
  renderer/   四个页面入口
    index.html     素材库 + 准备录制 + 设置 + 播放器
    recorder.html  隐藏的录制窗口（采集 + 编码 + 封装）
    control.html   悬浮控制条
    region.html    区域选择遮罩
  shared/     跨进程共享的类型与 IPC 通道名
docs/         竞品调研、需求文档、技术方案
```

## 录制管线

```
getDisplayMedia（屏幕 + 系统声音）
  → 区域裁剪（OffscreenCanvas，宽高取偶）
  → VideoEncoder(H.264/VP9) ┐
                             ├→ mp4-muxer → 分片（含写入位置）→ 主进程顺序落盘
系统音频 + 麦克风            │
  → WebAudio 混音 → AudioWorklet 取样 → AudioEncoder(AAC/Opus) ┘
```

暂停不打断编码器：丢弃暂停期间的帧，并在后续时间戳中扣除暂停时长，输出时间轴保持连续。

裁剪是「流拷贝」：ffmpeg `-ss/-t` + `-c copy`，不重编码，因此画质无损、速度快；代价是起点会对齐到前一关键帧（关键帧间隔 1 秒，所以最多多留约 1 秒开头）。裁剪为原地覆盖，失败时自动回滚原文件。

## 已知限制

- Windows / macOS 安装包内置 ffmpeg（见 `resources/ffmpeg/<平台-架构>/`），开箱即可转码与裁剪；Linux 版暂未内置，仍回退到系统 ffmpeg（没有时只能「原样复制」导出）。
- 裁剪按关键帧对齐，开头可能比设定值多出不超过 1 秒的画面；结尾为精确切割。
- macOS 需要屏幕录制与麦克风权限；14.2+ 的系统音频会额外弹一次授权，缺失时录到的音轨为静音但不报错。
- 当前不支持摄像头画中画、多显示器同时录制、直播推流。
- 崩溃恢复出来的录制，时长由修复后的 MP4 解析得出；分辨率与音频信息仍显示为「未记录」，因为 `meta.json` 只保存标题、时间与来源配置。文件本身可以正常播放与导出。