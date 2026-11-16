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

## 获取二进制（新克隆的仓库）

二进制不入库（`.gitignore` 忽略了 `/resources/ffmpeg/*/`），执行一次即可：

```bash
npm run fetch-ffmpeg              # 当前平台 + 当前架构
npm run fetch-ffmpeg -- --force   # 重新下载覆盖
npm run fetch-ffmpeg -- --arch=arm64
```

脚本按 `FFMPEG_RELEASE`（默认 `b6.1.1`）从 ffmpeg-static 的 Release 下载
`ffmpeg-<platform>-<arch>.gz` 与同名 `.LICENSE`，网络受限时可用
`FFMPEG_BINARIES_URL` 指向镜像。

## 更新二进制

```bash
# 覆盖对应目录后跑一次校验/打包
npm run fetch-ffmpeg -- --force
node scripts/verify-ffmpeg.mjs
npm run dist
```

注意：二进制**不入库**（`/resources/ffmpeg/*/` 已被 `.gitignore` 忽略），
每个环境用 `npm run fetch-ffmpeg` 或手动放置；只有本目录的 `README.md` 会提交。
如需把二进制纳入版本管理，改用 Git LFS（单文件仍需小于 100 MB，否则 GitHub 拒收）。