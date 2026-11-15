// SnowLuma 在 Linux 上的运行方式：官方只支持 Docker（镜像内置 Linux QQ + Xvfb + VNC + noVNC）。
//
// 这个模块只做四件事：
//   1. 判断本机 Docker 可用 / 容器是否存在 / 是否在跑；
//   2. 从容器挂载里找出 SnowLuma 的数据目录（/app/data），用于自动发现 OneBot token；
//   3. 启动/停止容器；
//   4. 给出 noVNC 地址（首次扫码登录用）。
//
// 刻意不在这里做「探测安装目录 / launcher.bat / SnowLuma.exe」——那是 Windows 的形态，
// Linux 上不存在，硬套只会给用户错误的提示。
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SNOWLUMA_CONTAINER = 'snowluma';

/** 容器名：显式配置 > 环境变量 > 默认。 */
export function snowLumaContainerName(cfg = {}) {
  const raw = cfg?.dockerContainer ?? cfg?.container ?? process.env.SNOWLUMA_CONTAINER;
  return String(raw || DEFAULT_SNOWLUMA_CONTAINER).trim() || DEFAULT_SNOWLUMA_CONTAINER;
}

function docker(args, timeout = 10_000) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

/** Docker 是否可用（守护进程在、当前用户有权限）。 */
export function dockerAvailable() {
  try {
    docker(['version', '--format', '{{.Server.Version}}'], 5_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * 查看 SnowLuma 容器。
 * @returns {{docker:boolean, exists:boolean, running:boolean, mounts:Array, image:string, error?:string}}
 */
export function inspectSnowLumaContainer(name = DEFAULT_SNOWLUMA_CONTAINER) {
  try {
    const out = docker(['inspect', name, '--format', '{{json .}}'], 10_000);
    const info = JSON.parse(out);
    return {
      docker: true,
      exists: true,
      running: Boolean(info?.State?.Running),
      mounts: Array.isArray(info?.Mounts) ? info.Mounts : [],
      image: String(info?.Config?.Image ?? ''),
      status: String(info?.State?.Status ?? ''),
    };
  } catch (error) {
    // 容器不存在时 docker inspect 退出码 1、stderr 是 "No such object"；
    // docker 没装/没权限时是 ENOENT 或 permission denied。两者要给不同的提示。
    const stderr = String(error?.stderr ?? '');
    if (/no such (object|container)/i.test(stderr)) {
      return { docker: true, exists: false, running: false, mounts: [], image: '' };
    }
    return {
      docker: !(error?.code === 'ENOENT'),
      exists: false,
      running: false,
      mounts: [],
      image: '',
      error: stderr.trim() || String(error?.message ?? error),
    };
  }
}

/** 从容器挂载里找 /app/data 在宿主机上的路径（bind mount 才有意义；匿名卷返回空）。 */
export function snowLumaDataDir(name = DEFAULT_SNOWLUMA_CONTAINER) {
  const info = inspectSnowLumaContainer(name);
  if (!info.exists) return '';
  const mount = info.mounts.find((m) => String(m?.Destination ?? '') === '/app/data');
  const source = String(mount?.Source ?? '').trim();
  // 匿名卷的 Source 在 /var/lib/docker/volumes/... 下，普通用户读不到，别当配置目录用。
  if (!source || source.startsWith('/var/lib/docker/')) return '';
  return source;
}

/**
 * Linux 上 token 自动发现的数据目录候选。
 * 顺序：显式环境变量 > Docker 挂载 > 常见部署位置。
 */
export function defaultSnowLumaDataDirs(name = DEFAULT_SNOWLUMA_CONTAINER) {
  const out = [];
  const add = (value) => {
    const text = String(value ?? '').trim();
    if (text && !out.includes(text)) out.push(text);
  };
  add(process.env.SNOWLUMA_DATA_DIR);
  add(snowLumaDataDir(name));
  add(path.join(os.homedir(), 'snowluma-data'));
  add(path.join(os.homedir(), 'SnowLuma2'));
  add('/srv/snowluma/data');
  add('/opt/snowluma/data');
  return out;
}

export function startSnowLumaContainer(name = DEFAULT_SNOWLUMA_CONTAINER) {
  try {
    docker(['start', name], 60_000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.stderr ?? error?.message ?? error).trim() };
  }
}

export function stopSnowLumaContainer(name = DEFAULT_SNOWLUMA_CONTAINER) {
  try {
    docker(['stop', name], 60_000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.stderr ?? error?.message ?? error).trim() };
  }
}

/** noVNC 地址：首次扫码登录必须从这里进（官方镜像只发布 6081）。 */
export function snowLumaVncUrl(cfg = {}) {
  return String(cfg?.vncUrl || process.env.SNOWLUMA_VNC_URL || 'http://127.0.0.1:6081/vnc.html').trim();
}
