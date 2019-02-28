import { timeout } from '@bumble/stream';

const isBackgroundPage = () =>
  location.protocol === 'chrome-extension:' &&
  (location.pathname === '/_generated_background_page.html' ||
    location.pathname ===
      chrome.runtime.getManifest().background.page);

const isContentScript = () =>
  location.protocol !== 'chrome-extension:';

/**
 * Retrieves the Window object for the background page running inside the current extension.
 * If the background page is unloaded, this will load the background page before resolving.
 *
 * See
 * [Chrome API Docs](https://developer.chrome.com/extensions/runtime#method-getBackgroundPage)
 * and
 * [MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/getBackgroundPage).
 *
 * @function getBackgroundPage
 * @returns {Promise<Window>} A Promise that will be fulfilled with the Window object for the background page, if there is one.
 *
 * @example
 * getBackgroundPage().then((bgWindow) => {
 *   // The background page window.
 * })
 */
const getBackgroundPage = () =>
  new Promise((resolve, reject) => {
    try {
      chrome.runtime.getBackgroundPage(w => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else {
          resolve(w);
        }
      });
    } catch (error) {
      reject(error);
    }
  });

let storeReady = false;
const state = {};
let listeners = [];

/**
 * Returns copy of state object or value returned from mapping fn
 *
 * @memberof BumbleStore
 * @function getState
 * @param {string|StateSelector} keyOrFn - key name or fn :: {state} -> any
 * @returns {Promise} Resolves with the state object or the value of the state property.
 *
 * @example
 * getState('apples').then((apples) => {
 *   console.log(apples)
 * })
 */
const getState = keyOrFn => {
  if (!storeReady) {
    notConnectedError('store.getState');
  }

  if (typeof keyOrFn === 'string' && keyOrFn.length) {
    // Get only one property of state
    let value = state[keyOrFn];

    if (value && value instanceof Array) {
      // Return copy of value if array
      return [...value]
    } else if (value && value instanceof Object) {
      // Return copy of value if object
      return { ...value }
    } else {
      // Primitive value, no need to copy
      return value
    }
  } else if (typeof keyOrFn === 'function') {
    return keyOrFn({ ...state })
  } else {
    // Return copy of whole state
    return { ...state }
  }
};
/**
 * Derive a value from the current state.
 *
 * @callback StateSelector
 * @param {Object} state - The current state.
 * @returns {any} Any derived value.
 */

let shouldUpdateState = true;
let composeNextState = s => s;

/**
 * Sets state asynchronously using a state object or a function that returns an object.
 *
 * @memberof BumbleStore
 * @function setState
 * @param {string|StateAction} newStateOrFn - key name or fn :: {state} -> {state}
 * @returns {Promise<Object>} Resolves to a copy of the new state object.
 *
 * @example
 * setState({ apples: 2 })
 *   .then((state) => {
 *     console.log('Number of apples:', state.apples)
 *   })
 */
const setState = newStateOrFn => {
  if (!storeReady) {
    notConnectedError('store.setState');
  }

  return new Promise((resolve, reject) => {
    try {
      const setter = composeNextState;
      let fn;

      if (typeof newStateOrFn === 'function') {
        fn = prevState => ({
          ...prevState,
          ...newStateOrFn(prevState),
        });
      } else {
        fn = prevState => ({
          ...prevState,
          ...newStateOrFn,
        });
      }

      composeNextState = nextState => fn(setter(nextState));

      if (shouldUpdateState) {
        // Force async update of state
        // to avoid unexpected side effects
        // for multiple event listeners
        timeout(0)
          .then(() => {
            // Compose new state and assign
            const nextState = composeNextState(getState());
            Object.assign(state, nextState);
            // Clean up
            shouldUpdateState = true;
            composeNextState = s => s;
            // Pseudo fire OnStateChange
            listeners.forEach(fn => fn(getState()));
          })
          .then(resolve);

        shouldUpdateState = false;
      }

      timeout(0).then(resolve);
    } catch (error) {
      reject(error);
    }
  }).then(getState)
};
/**
 * Map the state object at the time setState() fires.
 *
 * @callback StateAction
 * @param {Object} state A copy of current state object.
 * @returns {Object} The new state object.
 */

/**
 * Adds a listener function to onStateChange.
 *
 * @memberof onStateChange
 * @function addListener
 * @param {Function} listener - A state property name or fn :: {state} -> any
 * @returns {undefined} Returns undefined.
 *
 * @example
 * store.onStateChange.addListener(fn)
 */
const addListener = listener => {
  if (storeReady) {
    listeners = [...listeners, listener];
  } else {
    notConnectedError('store.onStateChange.addListener');
  }
};

/**
 * Removes a listener from onStateChange.
 *
 * @memberof onStateChange
 * @function removeListener
 * @param {Function} listener - The listener function to remove.
 * @returns {undefined} Returns undefined.
 *
 * @example
 * store.onStateChange.removeListener(fn)
 */
const removeListener = listener => {
  if (storeReady) {
    listeners = listeners.filter(l => l !== listener);
  } else {
    notConnectedError('store.onStateChange.removeListener');
  }
};

/**
 * Returns true if onStateChange has the listener.
 *
 * @memberof onStateChange
 * @function haslistener
 * @param {Function} listener - Function to match.
 * @returns {boolean} Returns true if onStateChange has the listener.
 *
 * @example
 * store.onStateChange.hasListener(fn)
 */
const hasListener = listener => {
  if (storeReady) {
    listeners.some(l => l === listener);
  } else {
    notConnectedError('store.onStateChange.hasListener');
  }
};

/**
 * Returns true if function has any listeners.
 *
 * @memberof onStateChange
 * @function haslisteners
 * @returns {boolean} Returns true onStateChange has any listeners.
 *
 * @example
 * store.onStateChange.hasListeners()
 */
const hasListeners = () => !!listeners.length;

/**
 * Calls all the onStateChange listeners.
 *
 * @memberof onStateChange
 * @function fireListeners
 * @returns {undefined} Returns undefined.
 *
 * @example
 * store.onStateChange.fireListeners()
 */
const fireListeners = () =>
  listeners.forEach(fn => fn(getState()));

/** @namespace */
const onStateChange = {
  addListener,
  removeListener,
  hasListener,
  hasListeners,
  fireListeners,
};

const notConnectedError = name => {
  throw new Error(
    `${name} is not initialized. Call this function after initStore() has completed.`,
  )
};

/** @namespace BumbleStore */
const store = {
  getState,
  setState,
  onStateChange,
};

const createStore = () => {
  const invertedStorePromise = {};

  const storePromise = new Promise((resolve, reject) => {
    Object.assign(invertedStorePromise, { resolve, reject });
  });

  const initStore = initialState => {
    if (storeReady) {
      // Store has already been initialized
      throw new Error('Cannot initialize the store twice.')
    } else if (!isBackgroundPage()) {
      // Not background page
      throw new Error(
        'Must initialize the store in the background page.',
      )
    } else {
      // Assign initial state values to store state
      Object.assign(state, initialState);

      invertedStorePromise.resolve(store);
      storeReady = true;

      return store
    }
  };

  window.bumbleStore = storePromise;

  return { initStore, storePromise }
};

/**
 * Sets up state and immediately calls the callback.
 * Sets window.store as a Promise that resolves with the store after the callback completes.
 *
 * @function initStore
 * @param {Object} initialState - The initial state values.
 * @returns {BumbleStore} The initialized store.
 *
 * @example
 * const {} = store.initStore({ apples: 2 })
 *
 * @example
 * const defaultState = { apples: 2 }
 * storageLocal.get('state')
 *   .then(({state = defaultState}) => state)
 *   .then(store.initStore)
 *   .then(({ setState, getState, onStateChange }) => {
 *     console.log('Store has been initialized.')
 *   })
 */
const { initStore, storePromise } = createStore();

const notConnectedError$1 = name => {
  throw new Error(
    `${name} is not initialized. Call this function inside connectToStore().then()`
  )
};

// TODO: Wire up better errors when bgStore is not ready
const backgroundStore = {
  getState: () => notConnectedError$1('backgroundStore.getState'),
  setState: () => notConnectedError$1('backgroundStore.setState'),
  onStateChange: {
    addListener: () =>
      notConnectedError$1(
        'backgroundStore.onStateChange.addListener'
      ),
    removeListener: () =>
      notConnectedError$1(
        'backgroundStore.onStateChange.removeListener'
      )
  }
};

// TODO: Test that isBackgroundPage and isContentScript works
const connectToStore = () => {
  if (isBackgroundPage()) ; else if (isContentScript()) ; else {
    return (
      getBackgroundPage()
        // Store is a promise
        .then(({ bumbleStore }) => bumbleStore)
        // Store is unwrapped after bg page initializes
        .then(store => {
          // console.log('store', store)
          // console.log('backgroundStore', backgroundStore)
          Object.assign(backgroundStore, store);
          return store
        })
    )
  }
};

/* ============================================ */

export { store, initStore, backgroundStore, connectToStore };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLWVzbS5qcyIsInNvdXJjZXMiOlsiLi4vc3JjL3N0b3JlLmNvbnRleHQuanMiLCIuLi9zcmMvc3RvcmUuYmFja2dyb3VuZC5qcyIsIi4uL3NyYy9zdG9yZS5jb25uZWN0LmpzIiwiLi4vc3JjL21haW4uanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IGlzQmFja2dyb3VuZFBhZ2UgPSAoKSA9PlxuICBsb2NhdGlvbi5wcm90b2NvbCA9PT0gJ2Nocm9tZS1leHRlbnNpb246JyAmJlxuICAobG9jYXRpb24ucGF0aG5hbWUgPT09ICcvX2dlbmVyYXRlZF9iYWNrZ3JvdW5kX3BhZ2UuaHRtbCcgfHxcbiAgICBsb2NhdGlvbi5wYXRobmFtZSA9PT1cbiAgICAgIGNocm9tZS5ydW50aW1lLmdldE1hbmlmZXN0KCkuYmFja2dyb3VuZC5wYWdlKVxuXG5leHBvcnQgY29uc3QgaXNDb250ZW50U2NyaXB0ID0gKCkgPT5cbiAgbG9jYXRpb24ucHJvdG9jb2wgIT09ICdjaHJvbWUtZXh0ZW5zaW9uOidcblxuZXhwb3J0IGNvbnN0IGlzQ29udGV4dFBhZ2UgPSAoKSA9PlxuICBsb2NhdGlvbi5wcm90b2NvbCA9PT0gJ2Nocm9tZS1leHRlbnNpb246JyAmJiAhaXNCYWNrZ3JvdW5kUGFnZVxuXG4vKipcbiAqIFJldHJpZXZlcyB0aGUgV2luZG93IG9iamVjdCBmb3IgdGhlIGJhY2tncm91bmQgcGFnZSBydW5uaW5nIGluc2lkZSB0aGUgY3VycmVudCBleHRlbnNpb24uXG4gKiBJZiB0aGUgYmFja2dyb3VuZCBwYWdlIGlzIHVubG9hZGVkLCB0aGlzIHdpbGwgbG9hZCB0aGUgYmFja2dyb3VuZCBwYWdlIGJlZm9yZSByZXNvbHZpbmcuXG4gKlxuICogU2VlXG4gKiBbQ2hyb21lIEFQSSBEb2NzXShodHRwczovL2RldmVsb3Blci5jaHJvbWUuY29tL2V4dGVuc2lvbnMvcnVudGltZSNtZXRob2QtZ2V0QmFja2dyb3VuZFBhZ2UpXG4gKiBhbmRcbiAqIFtNRE5dKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvTW96aWxsYS9BZGQtb25zL1dlYkV4dGVuc2lvbnMvQVBJL3J1bnRpbWUvZ2V0QmFja2dyb3VuZFBhZ2UpLlxuICpcbiAqIEBmdW5jdGlvbiBnZXRCYWNrZ3JvdW5kUGFnZVxuICogQHJldHVybnMge1Byb21pc2U8V2luZG93Pn0gQSBQcm9taXNlIHRoYXQgd2lsbCBiZSBmdWxmaWxsZWQgd2l0aCB0aGUgV2luZG93IG9iamVjdCBmb3IgdGhlIGJhY2tncm91bmQgcGFnZSwgaWYgdGhlcmUgaXMgb25lLlxuICpcbiAqIEBleGFtcGxlXG4gKiBnZXRCYWNrZ3JvdW5kUGFnZSgpLnRoZW4oKGJnV2luZG93KSA9PiB7XG4gKiAgIC8vIFRoZSBiYWNrZ3JvdW5kIHBhZ2Ugd2luZG93LlxuICogfSlcbiAqL1xuZXhwb3J0IGNvbnN0IGdldEJhY2tncm91bmRQYWdlID0gKCkgPT5cbiAgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjaHJvbWUucnVudGltZS5nZXRCYWNrZ3JvdW5kUGFnZSh3ID0+IHtcbiAgICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgIHJlamVjdChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKHcpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJlamVjdChlcnJvcilcbiAgICB9XG4gIH0pXG4iLCJpbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnQGJ1bWJsZS9zdHJlYW0nXG5pbXBvcnQgeyBpc0JhY2tncm91bmRQYWdlIH0gZnJvbSAnLi9zdG9yZS5jb250ZXh0J1xuXG5sZXQgc3RvcmVSZWFkeSA9IGZhbHNlXG5jb25zdCBzdGF0ZSA9IHt9XG5sZXQgbGlzdGVuZXJzID0gW11cblxuLyoqXG4gKiBSZXR1cm5zIGNvcHkgb2Ygc3RhdGUgb2JqZWN0IG9yIHZhbHVlIHJldHVybmVkIGZyb20gbWFwcGluZyBmblxuICpcbiAqIEBtZW1iZXJvZiBCdW1ibGVTdG9yZVxuICogQGZ1bmN0aW9uIGdldFN0YXRlXG4gKiBAcGFyYW0ge3N0cmluZ3xTdGF0ZVNlbGVjdG9yfSBrZXlPckZuIC0ga2V5IG5hbWUgb3IgZm4gOjoge3N0YXRlfSAtPiBhbnlcbiAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aXRoIHRoZSBzdGF0ZSBvYmplY3Qgb3IgdGhlIHZhbHVlIG9mIHRoZSBzdGF0ZSBwcm9wZXJ0eS5cbiAqXG4gKiBAZXhhbXBsZVxuICogZ2V0U3RhdGUoJ2FwcGxlcycpLnRoZW4oKGFwcGxlcykgPT4ge1xuICogICBjb25zb2xlLmxvZyhhcHBsZXMpXG4gKiB9KVxuICovXG5leHBvcnQgY29uc3QgZ2V0U3RhdGUgPSBrZXlPckZuID0+IHtcbiAgaWYgKCFzdG9yZVJlYWR5KSB7XG4gICAgbm90Q29ubmVjdGVkRXJyb3IoJ3N0b3JlLmdldFN0YXRlJylcbiAgfVxuXG4gIGlmICh0eXBlb2Yga2V5T3JGbiA9PT0gJ3N0cmluZycgJiYga2V5T3JGbi5sZW5ndGgpIHtcbiAgICAvLyBHZXQgb25seSBvbmUgcHJvcGVydHkgb2Ygc3RhdGVcbiAgICBsZXQgdmFsdWUgPSBzdGF0ZVtrZXlPckZuXVxuXG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIG5ldyBFcnJvcihgZ2V0U3RhdGU6IHN0YXRlLiR7a2V5T3JGbn0gaXMgdW5kZWZpbmVkLmApXG4gICAgfVxuXG4gICAgaWYgKHZhbHVlICYmIHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIC8vIFJldHVybiBjb3B5IG9mIHZhbHVlIGlmIGFycmF5XG4gICAgICByZXR1cm4gWy4uLnZhbHVlXVxuICAgIH0gZWxzZSBpZiAodmFsdWUgJiYgdmFsdWUgaW5zdGFuY2VvZiBPYmplY3QpIHtcbiAgICAgIC8vIFJldHVybiBjb3B5IG9mIHZhbHVlIGlmIG9iamVjdFxuICAgICAgcmV0dXJuIHsgLi4udmFsdWUgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBQcmltaXRpdmUgdmFsdWUsIG5vIG5lZWQgdG8gY29weVxuICAgICAgcmV0dXJuIHZhbHVlXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGVvZiBrZXlPckZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIGtleU9yRm4oeyAuLi5zdGF0ZSB9KVxuICB9IGVsc2Uge1xuICAgIC8vIFJldHVybiBjb3B5IG9mIHdob2xlIHN0YXRlXG4gICAgcmV0dXJuIHsgLi4uc3RhdGUgfVxuICB9XG59XG4vKipcbiAqIERlcml2ZSBhIHZhbHVlIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUuXG4gKlxuICogQGNhbGxiYWNrIFN0YXRlU2VsZWN0b3JcbiAqIEBwYXJhbSB7T2JqZWN0fSBzdGF0ZSAtIFRoZSBjdXJyZW50IHN0YXRlLlxuICogQHJldHVybnMge2FueX0gQW55IGRlcml2ZWQgdmFsdWUuXG4gKi9cblxubGV0IHNob3VsZFVwZGF0ZVN0YXRlID0gdHJ1ZVxubGV0IGNvbXBvc2VOZXh0U3RhdGUgPSBzID0+IHNcblxuLyoqXG4gKiBTZXRzIHN0YXRlIGFzeW5jaHJvbm91c2x5IHVzaW5nIGEgc3RhdGUgb2JqZWN0IG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGFuIG9iamVjdC5cbiAqXG4gKiBAbWVtYmVyb2YgQnVtYmxlU3RvcmVcbiAqIEBmdW5jdGlvbiBzZXRTdGF0ZVxuICogQHBhcmFtIHtzdHJpbmd8U3RhdGVBY3Rpb259IG5ld1N0YXRlT3JGbiAtIGtleSBuYW1lIG9yIGZuIDo6IHtzdGF0ZX0gLT4ge3N0YXRlfVxuICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gUmVzb2x2ZXMgdG8gYSBjb3B5IG9mIHRoZSBuZXcgc3RhdGUgb2JqZWN0LlxuICpcbiAqIEBleGFtcGxlXG4gKiBzZXRTdGF0ZSh7IGFwcGxlczogMiB9KVxuICogICAudGhlbigoc3RhdGUpID0+IHtcbiAqICAgICBjb25zb2xlLmxvZygnTnVtYmVyIG9mIGFwcGxlczonLCBzdGF0ZS5hcHBsZXMpXG4gKiAgIH0pXG4gKi9cbmV4cG9ydCBjb25zdCBzZXRTdGF0ZSA9IG5ld1N0YXRlT3JGbiA9PiB7XG4gIGlmICghc3RvcmVSZWFkeSkge1xuICAgIG5vdENvbm5lY3RlZEVycm9yKCdzdG9yZS5zZXRTdGF0ZScpXG4gIH1cblxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXR0ZXIgPSBjb21wb3NlTmV4dFN0YXRlXG4gICAgICBsZXQgZm5cblxuICAgICAgaWYgKHR5cGVvZiBuZXdTdGF0ZU9yRm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZm4gPSBwcmV2U3RhdGUgPT4gKHtcbiAgICAgICAgICAuLi5wcmV2U3RhdGUsXG4gICAgICAgICAgLi4ubmV3U3RhdGVPckZuKHByZXZTdGF0ZSksXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmbiA9IHByZXZTdGF0ZSA9PiAoe1xuICAgICAgICAgIC4uLnByZXZTdGF0ZSxcbiAgICAgICAgICAuLi5uZXdTdGF0ZU9yRm4sXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIGNvbXBvc2VOZXh0U3RhdGUgPSBuZXh0U3RhdGUgPT4gZm4oc2V0dGVyKG5leHRTdGF0ZSkpXG5cbiAgICAgIGlmIChzaG91bGRVcGRhdGVTdGF0ZSkge1xuICAgICAgICAvLyBGb3JjZSBhc3luYyB1cGRhdGUgb2Ygc3RhdGVcbiAgICAgICAgLy8gdG8gYXZvaWQgdW5leHBlY3RlZCBzaWRlIGVmZmVjdHNcbiAgICAgICAgLy8gZm9yIG11bHRpcGxlIGV2ZW50IGxpc3RlbmVyc1xuICAgICAgICB0aW1lb3V0KDApXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgLy8gQ29tcG9zZSBuZXcgc3RhdGUgYW5kIGFzc2lnblxuICAgICAgICAgICAgY29uc3QgbmV4dFN0YXRlID0gY29tcG9zZU5leHRTdGF0ZShnZXRTdGF0ZSgpKVxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihzdGF0ZSwgbmV4dFN0YXRlKVxuICAgICAgICAgICAgLy8gQ2xlYW4gdXBcbiAgICAgICAgICAgIHNob3VsZFVwZGF0ZVN0YXRlID0gdHJ1ZVxuICAgICAgICAgICAgY29tcG9zZU5leHRTdGF0ZSA9IHMgPT4gc1xuICAgICAgICAgICAgLy8gUHNldWRvIGZpcmUgT25TdGF0ZUNoYW5nZVxuICAgICAgICAgICAgbGlzdGVuZXJzLmZvckVhY2goZm4gPT4gZm4oZ2V0U3RhdGUoKSkpXG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXNvbHZlKVxuXG4gICAgICAgIHNob3VsZFVwZGF0ZVN0YXRlID0gZmFsc2VcbiAgICAgIH1cblxuICAgICAgdGltZW91dCgwKS50aGVuKHJlc29sdmUpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJlamVjdChlcnJvcilcbiAgICB9XG4gIH0pLnRoZW4oZ2V0U3RhdGUpXG59XG4vKipcbiAqIE1hcCB0aGUgc3RhdGUgb2JqZWN0IGF0IHRoZSB0aW1lIHNldFN0YXRlKCkgZmlyZXMuXG4gKlxuICogQGNhbGxiYWNrIFN0YXRlQWN0aW9uXG4gKiBAcGFyYW0ge09iamVjdH0gc3RhdGUgQSBjb3B5IG9mIGN1cnJlbnQgc3RhdGUgb2JqZWN0LlxuICogQHJldHVybnMge09iamVjdH0gVGhlIG5ldyBzdGF0ZSBvYmplY3QuXG4gKi9cblxuLyoqXG4gKiBBZGRzIGEgbGlzdGVuZXIgZnVuY3Rpb24gdG8gb25TdGF0ZUNoYW5nZS5cbiAqXG4gKiBAbWVtYmVyb2Ygb25TdGF0ZUNoYW5nZVxuICogQGZ1bmN0aW9uIGFkZExpc3RlbmVyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciAtIEEgc3RhdGUgcHJvcGVydHkgbmFtZSBvciBmbiA6OiB7c3RhdGV9IC0+IGFueVxuICogQHJldHVybnMge3VuZGVmaW5lZH0gUmV0dXJucyB1bmRlZmluZWQuXG4gKlxuICogQGV4YW1wbGVcbiAqIHN0b3JlLm9uU3RhdGVDaGFuZ2UuYWRkTGlzdGVuZXIoZm4pXG4gKi9cbmNvbnN0IGFkZExpc3RlbmVyID0gbGlzdGVuZXIgPT4ge1xuICBpZiAoc3RvcmVSZWFkeSkge1xuICAgIGxpc3RlbmVycyA9IFsuLi5saXN0ZW5lcnMsIGxpc3RlbmVyXVxuICB9IGVsc2Uge1xuICAgIG5vdENvbm5lY3RlZEVycm9yKCdzdG9yZS5vblN0YXRlQ2hhbmdlLmFkZExpc3RlbmVyJylcbiAgfVxufVxuXG4vKipcbiAqIFJlbW92ZXMgYSBsaXN0ZW5lciBmcm9tIG9uU3RhdGVDaGFuZ2UuXG4gKlxuICogQG1lbWJlcm9mIG9uU3RhdGVDaGFuZ2VcbiAqIEBmdW5jdGlvbiByZW1vdmVMaXN0ZW5lclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgLSBUaGUgbGlzdGVuZXIgZnVuY3Rpb24gdG8gcmVtb3ZlLlxuICogQHJldHVybnMge3VuZGVmaW5lZH0gUmV0dXJucyB1bmRlZmluZWQuXG4gKlxuICogQGV4YW1wbGVcbiAqIHN0b3JlLm9uU3RhdGVDaGFuZ2UucmVtb3ZlTGlzdGVuZXIoZm4pXG4gKi9cbmNvbnN0IHJlbW92ZUxpc3RlbmVyID0gbGlzdGVuZXIgPT4ge1xuICBpZiAoc3RvcmVSZWFkeSkge1xuICAgIGxpc3RlbmVycyA9IGxpc3RlbmVycy5maWx0ZXIobCA9PiBsICE9PSBsaXN0ZW5lcilcbiAgfSBlbHNlIHtcbiAgICBub3RDb25uZWN0ZWRFcnJvcignc3RvcmUub25TdGF0ZUNoYW5nZS5yZW1vdmVMaXN0ZW5lcicpXG4gIH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgb25TdGF0ZUNoYW5nZSBoYXMgdGhlIGxpc3RlbmVyLlxuICpcbiAqIEBtZW1iZXJvZiBvblN0YXRlQ2hhbmdlXG4gKiBAZnVuY3Rpb24gaGFzbGlzdGVuZXJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIC0gRnVuY3Rpb24gdG8gbWF0Y2guXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIG9uU3RhdGVDaGFuZ2UgaGFzIHRoZSBsaXN0ZW5lci5cbiAqXG4gKiBAZXhhbXBsZVxuICogc3RvcmUub25TdGF0ZUNoYW5nZS5oYXNMaXN0ZW5lcihmbilcbiAqL1xuY29uc3QgaGFzTGlzdGVuZXIgPSBsaXN0ZW5lciA9PiB7XG4gIGlmIChzdG9yZVJlYWR5KSB7XG4gICAgbGlzdGVuZXJzLnNvbWUobCA9PiBsID09PSBsaXN0ZW5lcilcbiAgfSBlbHNlIHtcbiAgICBub3RDb25uZWN0ZWRFcnJvcignc3RvcmUub25TdGF0ZUNoYW5nZS5oYXNMaXN0ZW5lcicpXG4gIH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgZnVuY3Rpb24gaGFzIGFueSBsaXN0ZW5lcnMuXG4gKlxuICogQG1lbWJlcm9mIG9uU3RhdGVDaGFuZ2VcbiAqIEBmdW5jdGlvbiBoYXNsaXN0ZW5lcnNcbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIHRydWUgb25TdGF0ZUNoYW5nZSBoYXMgYW55IGxpc3RlbmVycy5cbiAqXG4gKiBAZXhhbXBsZVxuICogc3RvcmUub25TdGF0ZUNoYW5nZS5oYXNMaXN0ZW5lcnMoKVxuICovXG5jb25zdCBoYXNMaXN0ZW5lcnMgPSAoKSA9PiAhIWxpc3RlbmVycy5sZW5ndGhcblxuLyoqXG4gKiBDYWxscyBhbGwgdGhlIG9uU3RhdGVDaGFuZ2UgbGlzdGVuZXJzLlxuICpcbiAqIEBtZW1iZXJvZiBvblN0YXRlQ2hhbmdlXG4gKiBAZnVuY3Rpb24gZmlyZUxpc3RlbmVyc1xuICogQHJldHVybnMge3VuZGVmaW5lZH0gUmV0dXJucyB1bmRlZmluZWQuXG4gKlxuICogQGV4YW1wbGVcbiAqIHN0b3JlLm9uU3RhdGVDaGFuZ2UuZmlyZUxpc3RlbmVycygpXG4gKi9cbmNvbnN0IGZpcmVMaXN0ZW5lcnMgPSAoKSA9PlxuICBsaXN0ZW5lcnMuZm9yRWFjaChmbiA9PiBmbihnZXRTdGF0ZSgpKSlcblxuLyoqIEBuYW1lc3BhY2UgKi9cbmNvbnN0IG9uU3RhdGVDaGFuZ2UgPSB7XG4gIGFkZExpc3RlbmVyLFxuICByZW1vdmVMaXN0ZW5lcixcbiAgaGFzTGlzdGVuZXIsXG4gIGhhc0xpc3RlbmVycyxcbiAgZmlyZUxpc3RlbmVycyxcbn1cblxuY29uc3Qgbm90Q29ubmVjdGVkRXJyb3IgPSBuYW1lID0+IHtcbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgIGAke25hbWV9IGlzIG5vdCBpbml0aWFsaXplZC4gQ2FsbCB0aGlzIGZ1bmN0aW9uIGFmdGVyIGluaXRTdG9yZSgpIGhhcyBjb21wbGV0ZWQuYCxcbiAgKVxufVxuXG4vKiogQG5hbWVzcGFjZSBCdW1ibGVTdG9yZSAqL1xuZXhwb3J0IGNvbnN0IHN0b3JlID0ge1xuICBnZXRTdGF0ZSxcbiAgc2V0U3RhdGUsXG4gIG9uU3RhdGVDaGFuZ2UsXG59XG5cbmNvbnN0IGNyZWF0ZVN0b3JlID0gKCkgPT4ge1xuICBjb25zdCBpbnZlcnRlZFN0b3JlUHJvbWlzZSA9IHt9XG5cbiAgY29uc3Qgc3RvcmVQcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIE9iamVjdC5hc3NpZ24oaW52ZXJ0ZWRTdG9yZVByb21pc2UsIHsgcmVzb2x2ZSwgcmVqZWN0IH0pXG4gIH0pXG5cbiAgY29uc3QgaW5pdFN0b3JlID0gaW5pdGlhbFN0YXRlID0+IHtcbiAgICBpZiAoc3RvcmVSZWFkeSkge1xuICAgICAgLy8gU3RvcmUgaGFzIGFscmVhZHkgYmVlbiBpbml0aWFsaXplZFxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgaW5pdGlhbGl6ZSB0aGUgc3RvcmUgdHdpY2UuJylcbiAgICB9IGVsc2UgaWYgKCFpc0JhY2tncm91bmRQYWdlKCkpIHtcbiAgICAgIC8vIE5vdCBiYWNrZ3JvdW5kIHBhZ2VcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ011c3QgaW5pdGlhbGl6ZSB0aGUgc3RvcmUgaW4gdGhlIGJhY2tncm91bmQgcGFnZS4nLFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBBc3NpZ24gaW5pdGlhbCBzdGF0ZSB2YWx1ZXMgdG8gc3RvcmUgc3RhdGVcbiAgICAgIE9iamVjdC5hc3NpZ24oc3RhdGUsIGluaXRpYWxTdGF0ZSlcblxuICAgICAgaW52ZXJ0ZWRTdG9yZVByb21pc2UucmVzb2x2ZShzdG9yZSlcbiAgICAgIHN0b3JlUmVhZHkgPSB0cnVlXG5cbiAgICAgIHJldHVybiBzdG9yZVxuICAgIH1cbiAgfVxuXG4gIHdpbmRvdy5idW1ibGVTdG9yZSA9IHN0b3JlUHJvbWlzZVxuXG4gIHJldHVybiB7IGluaXRTdG9yZSwgc3RvcmVQcm9taXNlIH1cbn1cblxuLyoqXG4gKiBTZXRzIHVwIHN0YXRlIGFuZCBpbW1lZGlhdGVseSBjYWxscyB0aGUgY2FsbGJhY2suXG4gKiBTZXRzIHdpbmRvdy5zdG9yZSBhcyBhIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIHRoZSBzdG9yZSBhZnRlciB0aGUgY2FsbGJhY2sgY29tcGxldGVzLlxuICpcbiAqIEBmdW5jdGlvbiBpbml0U3RvcmVcbiAqIEBwYXJhbSB7T2JqZWN0fSBpbml0aWFsU3RhdGUgLSBUaGUgaW5pdGlhbCBzdGF0ZSB2YWx1ZXMuXG4gKiBAcmV0dXJucyB7QnVtYmxlU3RvcmV9IFRoZSBpbml0aWFsaXplZCBzdG9yZS5cbiAqXG4gKiBAZXhhbXBsZVxuICogY29uc3Qge30gPSBzdG9yZS5pbml0U3RvcmUoeyBhcHBsZXM6IDIgfSlcbiAqXG4gKiBAZXhhbXBsZVxuICogY29uc3QgZGVmYXVsdFN0YXRlID0geyBhcHBsZXM6IDIgfVxuICogc3RvcmFnZUxvY2FsLmdldCgnc3RhdGUnKVxuICogICAudGhlbigoe3N0YXRlID0gZGVmYXVsdFN0YXRlfSkgPT4gc3RhdGUpXG4gKiAgIC50aGVuKHN0b3JlLmluaXRTdG9yZSlcbiAqICAgLnRoZW4oKHsgc2V0U3RhdGUsIGdldFN0YXRlLCBvblN0YXRlQ2hhbmdlIH0pID0+IHtcbiAqICAgICBjb25zb2xlLmxvZygnU3RvcmUgaGFzIGJlZW4gaW5pdGlhbGl6ZWQuJylcbiAqICAgfSlcbiAqL1xuY29uc3QgeyBpbml0U3RvcmUsIHN0b3JlUHJvbWlzZSB9ID0gY3JlYXRlU3RvcmUoKVxuXG5leHBvcnQgeyBpbml0U3RvcmUsIHN0b3JlUHJvbWlzZSB9XG4iLCJpbXBvcnQge1xuICBpc0JhY2tncm91bmRQYWdlLFxuICBpc0NvbnRlbnRTY3JpcHQsXG4gIGdldEJhY2tncm91bmRQYWdlXG59IGZyb20gJy4vc3RvcmUuY29udGV4dCdcblxuY29uc3Qgbm90Q29ubmVjdGVkRXJyb3IgPSBuYW1lID0+IHtcbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgIGAke25hbWV9IGlzIG5vdCBpbml0aWFsaXplZC4gQ2FsbCB0aGlzIGZ1bmN0aW9uIGluc2lkZSBjb25uZWN0VG9TdG9yZSgpLnRoZW4oKWBcbiAgKVxufVxuXG4vLyBUT0RPOiBXaXJlIHVwIGJldHRlciBlcnJvcnMgd2hlbiBiZ1N0b3JlIGlzIG5vdCByZWFkeVxuZXhwb3J0IGNvbnN0IGJhY2tncm91bmRTdG9yZSA9IHtcbiAgZ2V0U3RhdGU6ICgpID0+IG5vdENvbm5lY3RlZEVycm9yKCdiYWNrZ3JvdW5kU3RvcmUuZ2V0U3RhdGUnKSxcbiAgc2V0U3RhdGU6ICgpID0+IG5vdENvbm5lY3RlZEVycm9yKCdiYWNrZ3JvdW5kU3RvcmUuc2V0U3RhdGUnKSxcbiAgb25TdGF0ZUNoYW5nZToge1xuICAgIGFkZExpc3RlbmVyOiAoKSA9PlxuICAgICAgbm90Q29ubmVjdGVkRXJyb3IoXG4gICAgICAgICdiYWNrZ3JvdW5kU3RvcmUub25TdGF0ZUNoYW5nZS5hZGRMaXN0ZW5lcidcbiAgICAgICksXG4gICAgcmVtb3ZlTGlzdGVuZXI6ICgpID0+XG4gICAgICBub3RDb25uZWN0ZWRFcnJvcihcbiAgICAgICAgJ2JhY2tncm91bmRTdG9yZS5vblN0YXRlQ2hhbmdlLnJlbW92ZUxpc3RlbmVyJ1xuICAgICAgKVxuICB9XG59XG5cbi8vIFRPRE86IFRlc3QgdGhhdCBpc0JhY2tncm91bmRQYWdlIGFuZCBpc0NvbnRlbnRTY3JpcHQgd29ya3NcbmV4cG9ydCBjb25zdCBjb25uZWN0VG9TdG9yZSA9ICgpID0+IHtcbiAgaWYgKGlzQmFja2dyb3VuZFBhZ2UoKSkge1xuICAgIG5ldyBFcnJvcihcbiAgICAgICdDb250ZXh0IGVycm9yOiBjb25uZWN0VG9TdG9yZSBjYW5ub3QgcnVuIG9uIGEgYmFja2dyb3VuZCBwYWdlLidcbiAgICApXG4gIH0gZWxzZSBpZiAoaXNDb250ZW50U2NyaXB0KCkpIHtcbiAgICBuZXcgRXJyb3IoXG4gICAgICAnQ29udGV4dCBlcnJvcjogY29ubmVjdFRvU3RvcmUgY2Fubm90IHJ1biBpbnNpZGUgYSBjb250ZW50IHNjcmlwdC4nXG4gICAgKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiAoXG4gICAgICBnZXRCYWNrZ3JvdW5kUGFnZSgpXG4gICAgICAgIC8vIFN0b3JlIGlzIGEgcHJvbWlzZVxuICAgICAgICAudGhlbigoeyBidW1ibGVTdG9yZSB9KSA9PiBidW1ibGVTdG9yZSlcbiAgICAgICAgLy8gU3RvcmUgaXMgdW53cmFwcGVkIGFmdGVyIGJnIHBhZ2UgaW5pdGlhbGl6ZXNcbiAgICAgICAgLnRoZW4oc3RvcmUgPT4ge1xuICAgICAgICAgIC8vIGNvbnNvbGUubG9nKCdzdG9yZScsIHN0b3JlKVxuICAgICAgICAgIC8vIGNvbnNvbGUubG9nKCdiYWNrZ3JvdW5kU3RvcmUnLCBiYWNrZ3JvdW5kU3RvcmUpXG4gICAgICAgICAgT2JqZWN0LmFzc2lnbihiYWNrZ3JvdW5kU3RvcmUsIHN0b3JlKVxuICAgICAgICAgIHJldHVybiBzdG9yZVxuICAgICAgICB9KVxuICAgIClcbiAgfVxufVxuIiwiLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cbi8qICAgICAgICAgICAgICAgICBCVU1CTEUgU1RPUkUgICAgICAgICAgICAgICAgICovXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xuZXhwb3J0IHsgc3RvcmUsIGluaXRTdG9yZSB9IGZyb20gJy4vc3RvcmUuYmFja2dyb3VuZCdcblxuZXhwb3J0IHsgYmFja2dyb3VuZFN0b3JlLCBjb25uZWN0VG9TdG9yZSB9IGZyb20gJy4vc3RvcmUuY29ubmVjdCdcbiJdLCJuYW1lcyI6WyJub3RDb25uZWN0ZWRFcnJvciJdLCJtYXBwaW5ncyI6Ijs7QUFBTyxNQUFNLGdCQUFnQixHQUFHO0VBQzlCLFFBQVEsQ0FBQyxRQUFRLEtBQUssbUJBQW1CO0dBQ3hDLFFBQVEsQ0FBQyxRQUFRLEtBQUssa0NBQWtDO0lBQ3ZELFFBQVEsQ0FBQyxRQUFRO01BQ2YsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFDOztBQUVuRCxBQUFPLE1BQU0sZUFBZSxHQUFHO0VBQzdCLFFBQVEsQ0FBQyxRQUFRLEtBQUssb0JBQW1CO0FBQzNDLEFBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWtCQSxBQUFPLE1BQU0saUJBQWlCLEdBQUc7RUFDL0IsSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxLQUFLO0lBQy9CLElBQUk7TUFDRixNQUFNLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSTtRQUNwQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFO1VBQzVCLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUM7U0FDekMsTUFBTTtVQUNMLE9BQU8sQ0FBQyxDQUFDLEVBQUM7U0FDWDtPQUNGLEVBQUM7S0FDSCxDQUFDLE9BQU8sS0FBSyxFQUFFO01BQ2QsTUFBTSxDQUFDLEtBQUssRUFBQztLQUNkO0dBQ0YsQ0FBQzs7QUN2Q0osSUFBSSxVQUFVLEdBQUcsTUFBSztBQUN0QixNQUFNLEtBQUssR0FBRyxHQUFFO0FBQ2hCLElBQUksU0FBUyxHQUFHLEdBQUU7Ozs7Ozs7Ozs7Ozs7OztBQWVsQixBQUFPLE1BQU0s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
