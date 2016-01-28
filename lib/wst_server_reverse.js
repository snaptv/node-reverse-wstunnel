//###############################################################################
//##
//# Copyright (C) 2014-2015 Andrea Rocco Lotronto
//##
//# Licensed under the Apache License, Version 2.0 (the "License");
//# you may not use this file except in compliance with the License.
//# You may obtain a copy of the License at
//##
//# http://www.apache.org/licenses/LICENSE-2.0
//##
//# Unless required by applicable law or agreed to in writing, software
//# distributed under the License is distributed on an "AS IS" BASIS,
//# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//# See the License for the specific language governing permissions and
//# limitations under the License.
//##
//###############################################################################
  
var WebSocketServer, bindSockets, http, net, url, wst_server_reverse;

WebSocketServer = require('websocket').server;
util = require('util');
http = require('http');
url = require("url");
net = require("net");
bindSockets = require("./bindSockets_reverse");

var eventEmitter = require('events').EventEmitter;

wst_server_reverse = function(tcpListenHost) {
  this.tcpConnections = {};

  this.tcpListenHost = tcpListenHost;
  
  this.httpServer = http.createServer(function(request, response) {
    util.log('Received unhandled request for ' + request.url);
    response.writeHead(404);
    return response.end();
  });
      
  this.wsServerForControll = new WebSocketServer({
    httpServer: this.httpServer,
    autoAcceptConnections: false
    });
}

util.inherits(wst_server_reverse, eventEmitter);

wst_server_reverse.prototype.start = function(port) {

  this.httpServer.listen(port, function() {
    util.log("Server is listening on port %s", port);
  });
  
  this.wsServerForControll.on('request', (function(_this){
    return function(request){
      var uri = url.parse(request.httpRequest.url, true);
      
      if (uri.query.dst != undefined){
        //One TCP Server for each client WS Request
        request.tcpServer = new net.createServer();
        
        var remoteAddr = uri.query.dst;
        var hostComodo, portTcp;
        ref1 = remoteAddr.split(":"), hostComodo = ref1[0], portTcp = ref1[1];
     
        var payload = JSON.parse(request.httpRequest.headers.payload || "{}")
        request.tcpServer.listen({port: portTcp, host: _this.tcpListenHost}, () => {
          util.log("Created TCP server on port %s", request.tcpServer.address().port);
          _this.emit('tunnel-ready', request.tcpServer.address(), payload);
        });

        request.wsConnectionForControll = request.accept('tunnel-protocol', request.origin);
        //DEBUG MESSAGE FOR TESTING
        util.log("WS Connection for Control Created");

        request.wsConnectionForControll.on('close', function(reasonCode, description) {
          util.log("WebSocket Controll Peer %s disconnected for: %s", request.wsConnectionForControll.remoteAddress, description);
          util.log("Close TCP server on port %s", request.tcpServer.address().port);
          var address = request.tcpServer.address();
          request.tcpServer.close();
          _this.emit('tunnel-closed', address);
        });

        //Manage TCP Connection
        request.tcpServer.on('connection', (function(_this){
          
          return function(tcpConn){
            tcpConn.wsConnection;
            //Putting in pause the tcp connection waiting the new socket WS Socket for data
            tcpConn.pause();

            util.log("New connection on port %s", request.tcpServer.address().port);
          
            var idConnection = randomIntInc();
            _this.tcpConnections[idConnection] = tcpConn;
            var msgForNewConnection = "NC:"+idConnection;
            
            request.wsConnectionForControll.sendUTF(msgForNewConnection);
          }
        })(_this));
      }
      //REQUEST FOR WS SOCKET USED FOR DATA
      else{ 
        util.log("Request for Data WS Socket");
        //DEBUG MESSAGE FOR TESTING
        //util.log(typeof(_this.wsConnection));            
        var uri = url.parse(request.httpRequest.url, true);
        //DEBUG MESSAGE FOR TESTING
        //util.log("TEEEEEEEEESTTTT::"+uri.query.id);
        var tcpConn = _this.tcpConnections[uri.query.id];
        if (tcpConn) {
          //DEBUG MESSAGE FOR TESTING
          //util.log("TRUE")   
          //tcpConn.wsConnection = wsTCP;
          tcpConn.wsConnection = request.accept('tunnel-protocol', request.origin);
          bindSockets(tcpConn.wsConnection,tcpConn);
          //DEBUG MESSAGE FOR TESTING
          //util.log("Bind ws tcp");
          //Resuming of the tcp connection after WS Socket is just created
          tcpConn.resume();
          //DEBUG MESSAGE FOR TESTING
          //util.log("TCP RESUME");
        } else {
          util.log("Unknown connection ID: %s", uri.query.id);
        }
      }

    }
  })(this));
};

var nextConnectionId = 1000;
function randomIntInc() {
    return nextConnectionId++;
}

module.exports = wst_server_reverse;