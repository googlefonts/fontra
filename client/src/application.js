import RemoteObject from "./remote.js";


export default function getApplication(wsURL) {
  const app = new Proxy(new RemoteObject(wsURL), {
    get: function(remote, propertyName, app) {
      return function () {
        return remote.doCall(propertyName, Array.from(arguments))
      };
    }
  });
  return app;
}
