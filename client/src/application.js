export default class Application {

  constructor(wsUrl) {
      this.websocket = new WebSocket(wsUrl);
      this.websocket.onmessage = (event) => this._handleIncomingMessage(event);
      this._callReturnCallbacks = {};

      const g =_genNextCallID();
      this._getNextCallID = () => {return g.next().value};
  }

  getGlyph(glyphName) {
    return this._doCall("getGlyph", [glyphName])
  }

  _handleIncomingMessage(event) {
    const message = JSON.parse(event.data);
    const callID = message["call-id"];

    console.log("incoming message");
    console.log(message);
    if (callID !== undefined) {
      const returnCallbacks = this._callReturnCallbacks[callID];
      if (message.exception !== undefined) {
        returnCallbacks.reject(message.exception);
      } else {
        returnCallbacks.resolve(message["return-value"]);
      }
      delete this._callReturnCallbacks[callID];
    }
  }

  _doCall(methodName, args) {
    const callID = this._getNextCallID();
    const message = {
      "call-id": callID,
      "method-name": methodName,
      "arguments": args,
    };
    console.log("outgoing")
    console.log(message)
    this.websocket.send(JSON.stringify(message));

    this._callReturnCallbacks[callID] = {}
    return new Promise((resolve, reject) => {
      this._callReturnCallbacks[callID]["resolve"] = resolve;
      this._callReturnCallbacks[callID]["reject"] = reject;
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
