class RemoteException extends Error {
  constructor(message) {
    super(message);
    this.name = "RemoteException";
  }
}


export async function getRemoteProxy(wsURL) {
  const remote = new RemoteObject(wsURL);
  await remote.connect();
  const app = new Proxy(remote, {
    get: (remote, propertyName, app) => {
      if (propertyName === "then" || propertyName === "toJSON") {
        // Some introspection tries to see whether we can do "then",
        // and will treat us as a promise...
        return undefined;
      }
      return function (...args) {
        return remote.doCall(propertyName, args);
      };
    }
  });
  return app;
}


export class RemoteObject {

  constructor(wsURL) {
    this.wsURL = wsURL;
    this._callReturnCallbacks = {};

    const g =_genNextCallID();
    this._getNextCallID = () => {return g.next().value};
  }

  connect() {
    this.websocket = new WebSocket(this.wsURL);
    this.websocket.onmessage = event => this._handleIncomingMessage(event);
    return new Promise((resolve, reject) => {
      this.websocket.onopen = resolve;
      this.websocket.onerror = reject;
    })
  }

  _handleIncomingMessage(event) {
    const message = JSON.parse(event.data);
    const callID = message["call-id"];

    // console.log("incoming message");
    // console.log(message);
    if (callID !== undefined) {
      const returnCallbacks = this._callReturnCallbacks[callID];
      if (message["exception"] !== undefined) {
        returnCallbacks.reject(new RemoteException(message["exception"]));
      } else {
        returnCallbacks.resolve(message["return-value"]);
      }
      delete this._callReturnCallbacks[callID];
    }
  }

  async doCall(methodName, args) {
    const callID = this._getNextCallID();
    const message = {
      "call-id": callID,
      "method-name": methodName,
      "arguments": args,
    };
    if (this.websocket.readyState !== 1) {
      // console.log("reconnecting");
      await this.connect();
    }
    this.websocket.send(JSON.stringify(message));

    this._callReturnCallbacks[callID] = {}
    return new Promise((resolve, reject) => {
      this._callReturnCallbacks[callID].resolve = resolve;
      this._callReturnCallbacks[callID].reject = reject;
    });
  }

}


function* _genNextCallID() {
  let callID = 0;
  while (true) {
    yield callID;
    callID++;
  }
}
