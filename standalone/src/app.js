// 独立 SurfCore Web：把 DSH 的 client.js 挂到一个普通页面上。
// 只负责“宿主 shim”，不复制任何业务逻辑。
import React from 'react';
import { createRoot } from 'react-dom/client';

window.__SURFCORE_STANDALONE__ = true;
window.React = React;

const rootEl = document.getElementById('root');
const root = createRoot(rootEl);

window.__ModuleLoader__ = {
  load({ id, factory }) {
    try {
      window.__surfcoreExports = factory((name) => {
        if (name === 'react') return React;
        throw new Error(`standalone: unknown module "${name}"`);
      });
      window.__surfcoreLoaded = id;
    } catch (error) {
      window.__surfcoreLoadError = error;
    }
  },
};

window.__startSurfcore = () => {
  const errEl = document.getElementById('boot-error');
  if (window.__surfcoreLoadError) {
    errEl.textContent = `SurfCore 加载失败：${window.__surfcoreLoadError.message || window.__surfcoreLoadError}`;
    return;
  }
  const mod = window.__surfcoreExports;
  if (!mod?.apply) {
    errEl.textContent = 'SurfCore client.js 没有加载（检查 /client.js 是否可访问）';
    return;
  }
  const ctx = {
    effect(fn) { fn(); },
    slots: {
      inject(_name, fn) { fn(); },
      register(_meta, Component) {
        root.render(React.createElement(Component));
      },
    },
  };
  try {
    mod.apply(ctx);
  } catch (error) {
    errEl.textContent = `SurfCore 启动失败：${error?.message || error}`;
  }
};
