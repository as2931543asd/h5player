const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../h5player.user.js'), 'utf8');
const core = source.slice(source.indexOf('const mediaCore = (function () {'), source.indexOf('\n})();', source.indexOf('const mediaCore = (function () {')) + 6);
const helpers = source.slice(source.indexOf('function isDouyinHost ('), source.indexOf('\n/**\n * 媒体元素当前是否真的显示'));

function method(name) {
  const start = source.indexOf(`\n  ${name}`);
  assert.notEqual(start, -1, `missing method ${name}`);
  const end = source.indexOf('\n  },', start) + 5;
  return source.slice(start, end);
}

function environment() {
  const context = vm.createContext({ assert });
  vm.runInContext(`
    const window = { location: { hostname: 'www.douyin.com' } };
    class MediaStream {}
    class HTMLMediaElement {
      constructor(stream = false) {
        this.srcObject = stream ? new MediaStream() : null;
        this._rate = 1; this._time = 20; this.duration = stream ? Infinity : 120;
      }
      get playbackRate() { return this._rate }
      set playbackRate(v) { if (!this.srcObject) this._rate = v }
      get currentTime() { return this._time }
      set currentTime(v) { if (!this.srcObject) this._time = v }
      closest() { return this.root || null }
    }
    const original = { HTMLMediaElement, Object, Proxy, Map, map: {
      get: Map.prototype.get, set: Map.prototype.set
    }};
    ${core}
    ${helpers}
    mediaCore.init();
    const TCC = { doTask() { return false } };
    const i18n = { t: key => key };
    const numUp = v => Math.abs(Number(v));
    const numDown = v => -Math.abs(Number(v));
    const controls = {
      ${method('player: function')}
      ${method('setPlaybackRateUp (')}
      ${method('setPlaybackRateDown (')}
      ${method('resetPlaybackRate:')}
      ${method('setCurrentTimeUp (')}
      ${method('setCurrentTimeDown (')}
      ${method('keepDouyinPlaybackRate (')}
    };
    const configManager = { setLocalStorage() {} };
    function makeVod(direct = false) {
      const video = new HTMLMediaElement(true);
      const controller = { video, isLive: false, duration: 120, currentTime: 50, playbackRate: 1.5 };
      video.root = { _player: direct ? controller : { proxy: controller } };
      return { video, controller, api: mediaCore.mediaPlus(video) }
    }
    function bindControls(video) {
      const api = mediaCore.mediaPlus(video);
      return { ...controls, skipStep: 5, lastPlaybackRate: 1.5,
        player: () => video, tips() {},
        unLockPlaybackRate: () => api.unLockPlaybackRate(),
        lockPlaybackRate: () => api.lockPlaybackRate(),
        setPlaybackRate: v => api.setPlaybackRate(v),
        unLockCurrentTime: () => api.unLockCurrentTime(),
        lockCurrentTime: () => api.lockCurrentTime(),
        setCurrentTime: v => api.setCurrentTime(v)
      }
    }
    function isMediaVisible(media) { return media.isConnected && media.area > 0 }
    function getVisibleArea(media) { return media.area || 0 }
    function selectPlayer(list, current) {
      const h5 = { player: controls.player, playerInstance: current,
        getPlayerList: () => list, initPlayerInstance() {} };
      return h5.player()
    }
  `, context);
  return code => vm.runInContext(code, context);
}

test('点播输出流使用真实控制器，快进快退不会使用输出流时钟', () => {
  environment()(`
    const { video, controller, api } = makeVod();
    assert.equal(video.duration, Infinity);
    assert.equal(isControllableMedia(video), true);
    const h5 = bindControls(video);
    h5.setCurrentTimeUp(5);
    assert.equal(controller.currentTime, 55);
    h5.setCurrentTimeDown(10);
    assert.equal(controller.currentTime, 45);
    assert.equal(video.currentTime, 20);
    api.setCurrentTime(999);
    assert.equal(controller.currentTime, 120);
    api.setCurrentTime(-10);
    assert.equal(controller.currentTime, 0);
  `);
});

test('连续调速和恢复速度读取真实值，绕过原生倍速锁返回的 1', () => {
  environment()(`
    const { video, controller, api } = makeVod();
    const h5 = bindControls(video);
    api.lockPlaybackRate();
    assert.equal(video.playbackRate, 1);
    h5.setPlaybackRateUp(0.1);
    h5.setPlaybackRateUp(0.1);
    assert.ok(Math.abs(controller.playbackRate - 1.7) < 1e-9);
    h5.setPlaybackRateDown(0.1);
    assert.ok(Math.abs(controller.playbackRate - 1.6) < 1e-9);
    h5.resetPlaybackRate();
    assert.equal(controller.playbackRate, 1);
    h5.resetPlaybackRate();
    assert.ok(Math.abs(controller.playbackRate - 1.6) < 1e-9);
  `);
});

test('旧版原生视频仍使用原生接口，锁定只限制网页写入', () => {
  environment()(`
    const video = new HTMLMediaElement();
    const api = mediaCore.mediaPlus(video);
    assert.equal(isControllableMedia(video), true);
    api.setPlaybackRate(2);
    api.lockPlaybackRate();
    video.playbackRate = 3;
    assert.equal(video.playbackRate, 1);
    assert.equal(api.getPlaybackRate(), 2);
    bindControls(video).setPlaybackRateUp(0.1);
    assert.equal(api.getPlaybackRate(), 2.1);
    api.setCurrentTime(35);
    assert.equal(video.currentTime, 35);
  `);
});

test('真实直播和没有控制接口的动态背景不被当成点播', () => {
  environment()(`
    assert.equal(isControllableMedia(new HTMLMediaElement(true)), false);
    const { video, controller } = makeVod();
    controller.isLive = true;
    assert.equal(getDouyinVodController(video), null);
    assert.equal(isControllableMedia(video), false);
    controller.isLive = false;
    controller.duration = Infinity;
    assert.equal(getDouyinVodController(video), null);
  `);
});

test('只接受抖音域名、同一视频和有效点播属性', () => {
  environment()(`
    const { video, controller } = makeVod(true);
    assert.equal(getDouyinVodController(video), controller);
    window.location.hostname = 'notdouyin.com';
    assert.equal(getDouyinVodController(video), null);
    window.location.hostname = 'www.douyin.com';
    controller.video = new HTMLMediaElement();
    assert.equal(getDouyinVodController(video), null);
    controller.video = video;
    controller.currentTime = NaN;
    assert.equal(getDouyinVodController(video), null);
  `);
});

test('切换视频后重新解析控制器，销毁的代理不会抛错', () => {
  environment()(`
    const { video, controller, api } = makeVod();
    const next = { ...controller, currentTime: 5 };
    video.root._player = { proxy: next };
    api.setCurrentTime(15);
    assert.equal(next.currentTime, 15);
    assert.equal(controller.currentTime, 50);
    const revoked = Proxy.revocable({}, {});
    video.root._player.proxy = revoked.proxy;
    revoked.revoke();
    assert.equal(getDouyinVodController(video), null);
    assert.equal(isControllableMedia(video), false);
  `);
});

test('暂停或缓冲的视频可以接管背景流，隐藏的旧视频不会被选中', () => {
  environment()(`
    const background = new HTMLMediaElement(true);
    const main = new HTMLMediaElement();
    const old = new HTMLMediaElement();
    Object.assign(background, { isConnected: true, area: 1000, paused: false });
    Object.assign(main, { isConnected: true, area: 900, paused: true, readyState: 2 });
    Object.assign(old, { isConnected: true, area: 0, paused: false, readyState: 4 });
    assert.equal(selectPlayer([background, main, old], background), main);
  `);
});

test('初始选择当前最大的视频，避免选中较小直播预览或屏外预加载视频', () => {
  environment()(`
    const { video } = makeVod();
    const preview = new HTMLMediaElement();
    const preload = new HTMLMediaElement();
    Object.assign(video, { isConnected: true, area: 1000 });
    Object.assign(preview, { isConnected: true, area: 100, duration: Infinity });
    Object.assign(preload, { isConnected: true, area: 0 });
    assert.equal(selectPlayer([video, preview, preload]), video);
  `);
});

test('倍速锁定期间，抖音把内部播放器倍速改回去时会被恢复', () => {
  environment()(`
    const { video, controller } = makeVod();
    let locked = true;
    const h5 = { keepDouyinPlaybackRate: controls.keepDouyinPlaybackRate, playerInstance: video,
      isLockPlaybackRate: () => locked, getPlaybackRate: () => 2 };
    controller.playbackRate = 1;
    assert.equal(h5.keepDouyinPlaybackRate(video), true);
    assert.equal(controller.playbackRate, 2);
    assert.equal(h5.keepDouyinPlaybackRate(video), false);
    controller.playbackRate = 1;
    locked = false;
    assert.equal(h5.keepDouyinPlaybackRate(video), false);
    assert.equal(controller.playbackRate, 1);
    locked = true;
    h5.playerInstance = new HTMLMediaElement();
    assert.equal(h5.keepDouyinPlaybackRate(video), false);
    assert.equal(controller.playbackRate, 1);
  `);
});

test('用户暂停当前视频时，不会跳去控制另一个暂停的视频', () => {
  environment()(`
    const current = new HTMLMediaElement();
    const other = new HTMLMediaElement();
    Object.assign(current, { isConnected: true, area: 500, paused: true });
    Object.assign(other, { isConnected: true, area: 2000, paused: true });
    assert.equal(selectPlayer([current, other], current), current);
    other.paused = false;
    assert.equal(selectPlayer([current, other], current), other);
  `);
});
