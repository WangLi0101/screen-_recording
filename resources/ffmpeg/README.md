# 内置 ffmpeg

应用不依赖用户机器上的 ffmpeg：二进制随包分发，按 `平台-架构` 放在本目录下，
由 `electron-builder.yml` 的 `extraResources` 拷贝到安装包的 `<resources>/ffmpeg/`。

```
resources/ffmpeg/
  win32-x64/ffmpeg.exe   + LICENSE.txt
  darwin-x64/ffmpeg      + LICENSE.txt
  darwin-arm64/ffmpeg    + LICENSE.txt
```

运行时解析顺序（`src/main/ffmpeg.ts`）：

1. 打包态：`<resources>/ffmpeg/ffmpeg[.exe]`
2. 开发态：`<项目根>/resources/ffmpeg/<platform>-<arch>/ffmpeg[.exe]`
3. 兜底：系统 `PATH` 里的 ffmpeg

新增平台（例如 linux）只要放好 `linux-x64/ffmpeg`，再在 `electron-builder.yml`
的 `linux` 下加同样的 `extraResources` 即可。

## 当前文件来源

| 目录 | 版本 | 来源 | 许可证/可再分发性 |
| --- | --- | --- | --- |
| `win32-x64` | 6.1.1 essentials | gyan.dev 构建，取自 [ffmpeg-static b6.1.1](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1) | `--enable-gpl --enable-version3`（无 `--enable-nonfree`），GPLv3：闭源分发需按 GPL 提供对应源码/声明 |
| `darwin-x64` / `darwin-arm64` | 6.1.1 | 同上 release 的 darwin 资产（evermeet 构建） | ⚠️ 配置含 `--enable-gpl --enable-nonfree`，按 FFmpeg 官方说明**不可再分发**，正式发布前必须替换 |

## 替换 macOS 二进制的建议

用 LGPL 配置自行构建（不启用 `--enable-gpl/nonfree`，软编走 WebCodecs），例如：

```bash
./configure --prefix=/tmp/ff --disable-shared --enable-static \
  --disable-programs --enable-ffmpeg --disable-doc --disable-debug
make -j$(sysctl -n hw.ncpu)
```

或使用自己信任的 LGPL 静态构建，替换 `darwin-*/ffmpeg` 后同步更新 `LICENSE.txt`。

Windows 二进制若要闭源分发，同样应换成 LGPL 构建，或完成 GPL 合规（随包附带许可证与源码获取方式）。

## 更新二进制

```bash
# 覆盖对应目录后跑一次校验/打包
node scripts/verify-ffmpeg.mjs
npm run dist
```

注意：`resources/ffmpeg/**` 里的可执行文件必须提交到仓库（不要加进 `.gitignore`）。
单文件不要超过 100 MB，否则会被 GitHub 拒绝推送。