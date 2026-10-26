/* When the app runs inside Expo, mirror this page's localStorage to AsyncStorage. */
(function () {
  const nativeBridge = window.ReactNativeWebView;
  if (!nativeBridge || typeof nativeBridge.injectedObjectJson !== 'function' ||
      typeof nativeBridge.postMessage !== 'function') return;

  let injected = {};
  try {
    injected = JSON.parse(nativeBridge.injectedObjectJson() || '{}');
  } catch {
    return;
  }

  const localStore = window.localStorage;
  const storagePrototype = Storage.prototype;
  const original = {
    getItem: storagePrototype.getItem,
    setItem: storagePrototype.setItem,
    removeItem: storagePrototype.removeItem,
    clear: storagePrototype.clear,
    key: storagePrototype.key,
    length: Object.getOwnPropertyDescriptor(storagePrototype, 'length')
  };

  const memory = Object.create(null);
  const initial = injected.edufinanceLocalStorage;
  if (initial && typeof initial === 'object' && !Array.isArray(initial)) {
    for (const [key, value] of Object.entries(initial)) {
      if (typeof value === 'string') memory[key] = value;
    }
  }

  // Import any pre-existing storage in this WebView on the first native launch.
  if (Object.keys(memory).length === 0) {
    for (let index = 0; index < original.length.get.call(localStore); index += 1) {
      const key = original.key.call(localStore, index);
      if (key !== null) memory[key] = original.getItem.call(localStore, key);
    }
  }

  function publish() {
    try {
      nativeBridge.postMessage(JSON.stringify({
        type: 'edufinance-localstorage',
        data: memory
      }));
    } catch {
      // The page remains usable if the native bridge is temporarily unavailable.
    }
  }

  storagePrototype.getItem = function (key) {
    if (this !== localStore) return original.getItem.call(this, key);
    const normalizedKey = String(key);
    return Object.prototype.hasOwnProperty.call(memory, normalizedKey) ? memory[normalizedKey] : null;
  };
  storagePrototype.setItem = function (key, value) {
    if (this !== localStore) return original.setItem.call(this, key, value);
    memory[String(key)] = String(value);
    publish();
  };
  storagePrototype.removeItem = function (key) {
    if (this !== localStore) return original.removeItem.call(this, key);
    delete memory[String(key)];
    publish();
  };
  storagePrototype.clear = function () {
    if (this !== localStore) return original.clear.call(this);
    for (const key of Object.keys(memory)) delete memory[key];
    publish();
  };
  storagePrototype.key = function (index) {
    if (this !== localStore) return original.key.call(this, index);
    return Object.keys(memory)[index] ?? null;
  };
  Object.defineProperty(storagePrototype, 'length', {
    configurable: true,
    get() {
      if (this !== localStore) return original.length.get.call(this);
      return Object.keys(memory).length;
    }
  });

  publish();
})();
