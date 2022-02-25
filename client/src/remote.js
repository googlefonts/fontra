class RemoteException extends Error {
  constructor(message) {
    super(message);
    this.name = "RemoteException";
  }
}


export async function getRemoteProxy(wsURL) {
  const remote = new RemoteObject(wsURL);
  await remote.connect();
  const remoteProxy = new Proxy(remote, {
    get: (remote, propertyName) => {
      if (propertyName === "then" || propertyName === "toJSON") {
        // Some introspection tries to see whether we can do "then",
        // and will treat us as a promise...
        return undefined;
      }
      return (...args) => {
        return remote.doCall(propertyName, args);
      };
    }
  });
  return remoteProxy;
}


export class RemoteObject {

  constructor(wsURL) {
    this.wsURL = wsURL;
    this._callReturnCallbacks = {};

    const g = _genNextClientCallID();
    this._getNextClientCallID = () => {return g.next().value};
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
    const clientCallID = message["client-call-id"];
    const serverCallID = message["server-call-id"];

    // console.log("incoming message");
    // console.log(message);
    if (clientCallID !== undefined) {
      const returnCallbacks = this._callReturnCallbacks[clientCallID];
      if (message["exception"] !== undefined) {
        returnCallbacks.reject(new RemoteException(message["exception"]));
      } else {
        returnCallbacks.resolve(message["return-value"]);
      }
      delete this._callReturnCallbacks[clientCallID];
    } else if (serverCallID !== undefined) {
      console.log("incoming", message);
    }
  }

  async doCall(methodName, args) {
    const clientCallID = this._getNextClientCallID();
    const message = {
      "client-call-id": clientCallID,
      "method-name": methodName,
      "arguments": args,
    };
    if (this.websocket.readyState !== 1) {
      // console.log("reconnecting");
      await this.connect();
    }
    this.websocket.send(JSON.stringify(message));

    this._callReturnCallbacks[clientCallID] = {}
    return new Promise((resolve, reject) => {
      this._callReturnCallbacks[clientCallID].resolve = resolve;
      this._callReturnCallbacks[clientCallID].reject = reject;
    });
  }

}


function* _genNextClientCallID() {
  let clientCallID = 0;
  while (true) {
    yield clientCallID;
    clientCallID++;
  }
}
