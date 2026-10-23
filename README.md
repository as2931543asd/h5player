# h5player 个人维护版

基于 [xxxily/h5player](https://github.com/xxxily/h5player) 及当前目录中的个人修改继续维护。
保留原脚本的 GPL 许可声明和来源。

- `h5player.user.js`：安装和维护的脚本，当前版本 5.0.1。
- `0bf0bf68-a02f-4e2d-aca2-209516e07ed8.txt`：收到的 4.3.5 参考脚本，原样保存。
- `tests/douyin.test.cjs`：使用 Node.js 内置测试运行器，无需安装依赖。

## 安装更新

在 Tampermonkey 中打开已安装的个人版脚本，用 `h5player.user.js` 的完整内容替换并保存，
然后刷新抖音页面。避免同时启用多个 h5player 版本。

## 5.0.1 修复

抖音的新点播播放器会通过 MediaStream 输出视频，因此 DOM video 的时长可能是 Infinity，
原生 playbackRate/currentTime 也不能控制真实播放。此前会被提示为“直播不支持调速和快进快退”。

现在在抖音域名下，检查当前 video 所属 `.douyin-player` 的 `_player.proxy`（或直接 `_player`），
确认它绑定同一 video、明确为非直播且具有有效点播时长后，通过代理读取和设置倍速、进度。
普通原生播放器继续使用原有接口。没有点播接口的媒体流使用准确的“不支持控制”提示。

同时修正连续调速读取被锁伪装为 1 的倍速值，以及媒体流切换到暂停或缓冲视频时的选择逻辑。
代理每次动态解析，不缓存，避免信息流切换后控制旧视频；进度限制在 0 到真实时长之间。

该适配使用抖音页面的内部播放器接口。页面升级可能改变接口，届时需重新检查。

## 检查

```powershell
node --check h5player.user.js
node --test tests/douyin.test.cjs
```

浏览器回归：分别打开普通新播放器视频、原生视频与真实直播；检查左右方向键、X/C 调速、
Z 恢复速度，以及切换视频后的控制对象。自动测试使用模拟媒体对象，不能代替浏览器实测。

## Git

仓库默认分支为 `main`。首个提交保留修改前基线，后续提交记录本次修复。
当前为本地仓库，尚未设置远程仓库。

