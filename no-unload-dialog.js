(function () {
  try {
    Object.defineProperty(window, 'onbeforeunload', {
      configurable: true,
      get() { return null; },
      set() {}
    });
  } catch (e) { window.onbeforeunload = null; }

  const realAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === 'beforeunload') return;
    return realAdd.call(this, type, listener, options);
  };
})();
