'use strict';

/**
 * This is only to be created by a VVCSession.
 *
 * @classdesc The control channel created and owned by a VVCSession.
 *
 * @constructor
 * @protected
 * @extends {VVCChannel}
 * @param {VVCSession} session The session this control channel belongs to
 * @return {VVCControlChannel}
 */
var VVCControlChannel = function(session)
{
   VVCChannel.call(this, session,
                   VVC.CONTROL_CHANNEL_ID,
                   VVC.CONTROL_CHANNEL_NAME,
                   0, 0, 0);

   this.state = VVC.CHANNEL_STATE.OPEN;

   /**
    * The negotiated major version.
    * @type {Number}
    */
   this.versionMajor = 0;


   /**
    * The negotiated minor version.
    * @type {Number}
    */
   this.versionMinor = 0;


   /**
    * The current rtt ping send time.
    * @type {Number}
    */
   this._rttSendTimeMS = 0;
};


VVCControlChannel.prototype = Object.create(VVCChannel.prototype);


/**
 * Size of CTRL header.
 *
 * @type {Number}
 * @readonly
 * @default
 */
VVC.CTRL_HEADER_SIZE = 4;


/**
 * Control channel id.
 *
 * @type {Number}
 * @readonly
 * @default
 */
VVC.CONTROL_CHANNEL_ID = 0;


/**
 * Control channel name.
 *
 * @type {String}
 * @readonly
 * @default
 */
VVC.CONTROL_CHANNEL_NAME = 'vvcctrl';


/**
 * Control channel message opcodes.
 * @enum {Number}
 * @readonly
 */
VVC.CTRL_OP = {
   /** Receive acknowledgement, used for bandwidth estimation */
   RECV_ACK:            0x01,

   /** Initiate VVC, first op sent from client to server */
   INIT:                0x02,

   /** Initiate VVC acknowledgement */
   INIT_ACK:            0x03,

   /** Open channel */
   OPEN_CHAN:           0x04,

   /** Open channel acknowledgement */
   OPEN_CHAN_ACK:       0x05,

   /** Open channel cancel */
   OPEN_CHAN_CANCEL:    0x06,

   /** Close channel */
   CLOSE_CHAN:          0x07,

   /** Close channel acknowledgement */
   CLOSE_CHAN_ACK:      0x08,

   /** Round trip time ping */
   RTT:                 0x09,

   /** Round trip time pong */
   RTT_ACK:             0x0A,
};


/**
 * Control channel message header flags.
 * @enum {Number}
 * @readonly
 */
VVC.CTRL_FLAG = {
   /** The control packet has data */
   ODAT:                0x80,
};


/**
 * Init extension header flags.
 * @enum {Number}
 * @readonly
 */
VVC.INIT_EXT_FLAG = {
   /** The extension has data */
   EDAT:                0x8000,
};


/**
 * Init extension types.
 * @enum {Number}
 * @readonly
 */
VVC.INIT_EXT_TYPE = {
   /** Additional supported version. */
   VERSION: 0x01,

   /** Probe channel support. */
   PROBE: 0x02,
};


/**
 * Init extension probe flags.
 * @enum {Number}
 * @readonly
 */
VVC.INIT_EXT_PROBE_FLAG = {
   /** Probe channel is supported */
   SUPPORTED:           0x01,
};


/**
 * Open channel acknowledgement status
 * @enum {Number}
 * @readonly
 */
VVC.OPEN_CHAN_STATUS = {
   SUCCESS: 0,
   REJECT:  1,
   TIMEOUT: 2,
};


/**
 * Close channel reason
 * @enum {Number}
 * @readonly
 */
VVC.CLOSE_CHAN_REASON = {
   NORMAL: 0,
   ERROR:  1,
};


/**
 * Close channel acknowledgement status
 * @enum {Number}
 * @readonly
 */
VVC.CLOSE_CHAN_STATUS = {
   SUCCESS: 0,
   ERROR:   1,
};


/**
 * Expected size of data for each control message
 * @type {Number[]}
 * @readonly
 */
VVC.CTRL_OP.SIZE = [];
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.RECV_ACK]         = 0;
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.INIT]             = 12;
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.INIT_ACK]         = 12;
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.OPEN_CHAN]        = 20;
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.OPEN_CHAN_ACK]    = 12;
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.OPEN_CHAN_CANCEL] = 0;
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.CLOSE_CHAN]       = 8;
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.CLOSE_CHAN_ACK]   = 8;
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.RTT]              = 0;
VVC.CTRL_OP.SIZE[VVC.CTRL_OP.RTT_ACK]          = 0;


/**
 * Text name of each CTRL_OP for debugging and error messages
 * @type {String[]}
 * @readonly
 */
VVC.CTRL_OP.NAME = [];
VVC.CTRL_OP.NAME[VVC.CTRL_OP.RECV_ACK]         = 'VVC.CTRL_OP.RECV_ACK';
VVC.CTRL_OP.NAME[VVC.CTRL_OP.INIT]             = 'VVC.CTRL_OP.INIT';
VVC.CTRL_OP.NAME[VVC.CTRL_OP.INIT_ACK]         = 'VVC.CTRL_OP.INIT_ACK';
VVC.CTRL_OP.NAME[VVC.CTRL_OP.OPEN_CHAN]        = 'VVC.CTRL_OP.OPEN_CHAN';
VVC.CTRL_OP.NAME[VVC.CTRL_OP.OPEN_CHAN_ACK]    = 'VVC.CTRL_OP.OPEN_CHAN_ACK';
VVC.CTRL_OP.NAME[VVC.CTRL_OP.OPEN_CHAN_CANCEL] = 'VVC.CTRL_OP.OPEN_CHAN_CANCEL';
VVC.CTRL_OP.NAME[VVC.CTRL_OP.CLOSE_CHAN]       = 'VVC.CTRL_OP.CLOSE_CHAN';
VVC.CTRL_OP.NAME[VVC.CTRL_OP.CLOSE_CHAN_ACK]   = 'VVC.CTRL_OP.CLOSE_CHAN_ACK';
VVC.CTRL_OP.NAME[VVC.CTRL_OP.RTT]              = 'VVC.CTRL_OP.RTT';
VVC.CTRL_OP.NAME[VVC.CTRL_OP.RTT_ACK]          = 'VVC.CTRL_OP.RTT_ACK';


/**
 * Sends a VVC.CTRL_OP.INIT message.
 * Requests to initiate the connection.
 *
 * @protected
 * @param  {VVC.CTRL_OP} [code] The CTRL_OP code to use so we can reuse this
 *                              function as both the INIT and INIT_ACK messages
 *                              have identical data.
 * @return {Boolean}            Returns true on successful send
 */
VVCControlChannel.prototype.sendInit = function(code)
{
   var extensionLen, i, packet;

   if (code === undefined) {
      code = VVC.CTRL_OP.INIT;
   }

   if (code !== VVC.CTRL_OP.INIT && code !== VVC.CTRL_OP.INIT_ACK) {
      this._vvcInstance.setLastError(VVC.STATUS.INVALID_ARGS,
                                      'VVCControlChannel.sendInit',
                                      'Invalid code, '
                                      + ' expected INIT or INIT_ACK');
      return false;
   }

   packet = this._createControlPacket(code);
   packet.writeUint16(VVC.MAJOR_VER);
   packet.writeUint16(VVC.MINOR_VER);
   packet.writeUint32(VVC.CAPS_V10_1);
   packet.writeUint32(VVC.CAPS_V10_2);

   if (VVC.MAJOR_VER >= 2) {
      extensionLen = 16 * VVC.SUPPORTED_VER.length;

      if (VVC.ENABLE_PROBE_CHANNEL) {
         extensionLen += 8;
      }

      packet.writeUint32(extensionLen);

      // Add all supported versions
      for (i = 0; i < VVC.SUPPORTED_VER.length; ++i) {
         // Extension header
         packet.writeUint16(VVC.INIT_EXT_TYPE.VERSION);
         packet.writeUint16(VVC.INIT_EXT_FLAG.EDAT);
         packet.writeUint32(8);

         // Extension data
         packet.writeUint16(VVC.SUPPORTED_VER[i].MAJOR);
         packet.writeUint16(VVC.SUPPORTED_VER[i].MINOR);
         packet.writeUint32(VVC.SUPPORTED_VER[i].FLAGS);
      }

      // Probe channel support
      if (VVC.ENABLE_PROBE_CHANNEL) {
         packet.writeUint16(VVC.INIT_EXT_TYPE.PROBE);
         packet.writeUint16(0);
         packet.writeUint32(VVC.INIT_EXT_PROBE_FLAG.SUPPORTED);
      }
   }

   return this._sendControlPacket(packet);
};


/**
 * Sends a VVC.CTRL_OP.RTT message.
 * Used as a ping/pong system for measuring round trip times.
 *
 * @protected
 * @return {Boolean} Returns true on successful send
 */
VVCControlChannel.prototype.sendRtt = function()
{
   this._rttSendTimeMS = Date.now();
   return this._sendControlPacket(this._createControlPacket(VVC.CTRL_OP.RTT));
};


/**
 * Sends a VVC.CTRL_OP.RECV_ACK message.
 * Acknowledges receiving of chunk data.
 * Will send multiple messages if bytes is above 0xffff.
 *
 * @protected
 * @param  {Number}  bytes The number of bytes to acknowledge
 * @return {Boolean}       Returns true on successful send
 */
VVCControlChannel.prototype.sendRecvAck = function(bytes)
{
   var packet;

   while (bytes > 0xffff) {
      packet = this._createControlPacket(VVC.CTRL_OP.RECV_ACK, 0, 0xffff - 1);
      this._sendControlPacket(packet);
      bytes -= 0xffff;
   }

   if (bytes > 0) {
      packet = this._createControlPacket(VVC.CTRL_OP.RECV_ACK, 0, bytes - 1);
      this._sendControlPacket(packet);
   }

   return true;
};


/**
 * Sends a VVC.CTRL_OP.OPEN_CHAN message.
 *
 * Requests to open a new channel.
 *
 * @protected
 * @param  {VVCChannel} channel       The channel to open
 * @param  {Uint8Array} [initialData] Initial data to send with the open request
 * @return {Boolean}                  Returns true on successful send
 */
VVCControlChannel.prototype.sendOpenChannel = function(channel, initialData)
{
   var packet, initialDataLen = 0;

   if (!(channel instanceof VVCChannel)) {
      this._vvcInstance.setLastError(VVC.STATUS.INVALID_ARGS,
                                      'VVCControlChannel.sendOpenChannel',
                                      'Invalid channel, '
                                      + ' expected instanceof VVCChannel');
      return false;
   }

   initialDataLen = 0;

   if (!!initialData) {
      initialDataLen = initialData.length;
   }

   packet = this._createControlPacket(VVC.CTRL_OP.OPEN_CHAN);
   packet.writeUint32(channel.id);
   packet.writeUint32(channel.priority);
   packet.writeUint32(channel.flags);
   packet.writeUint32(channel.timeout);
   packet.writeUint16(0);  // Reserved
   packet.writeUint8(0);   // Reserved2
   packet.writeUint8(channel.name.length);
   packet.writeUint32(initialDataLen);
   packet.writeStringASCII(channel.name);

   if (initialDataLen) {
      packet.writeArray(initialData);
   }

   return this._sendControlPacket(packet);
};


/**
 * Sends a VVC.CTRL_OP.OPEN_CHAN_ACK message.
 *
 * Responds to requests to open a new channel.
 *
 * @protected
 * @param  {VVCChannel}           channel       The channel to open
 * @param  {VVC.OPEN_CHAN_STATUS} status        The acknowledgement status
 * @param  {Uint8Array}           [initialData] Initial data to send with ack
 * @return {Boolean}                            Returns true on successful send
 */
VVCControlChannel.prototype.sendOpenChannelAck = function(channel,
                                                          status,
                                                          initialData)
{
   var packet = this._createControlPacket(VVC.CTRL_OP.OPEN_CHAN_ACK);
   packet.writeUint32(channel.id);
   packet.writeUint32(status);

   if (!!initialData) {
      packet.writeUint32(initialData.length);
      packet.writeArray(initialData);
   } else {
      packet.writeUint32(0);
   }

   return this._sendControlPacket(packet);
};


/**
 * Sends a VVC.CTRL_OP.CLOSE_CHAN message.
 *
 * Requests to close a channel.
 *
 * @protected
 * @param  {VVCChannel}            channel The channel to close
 * @param  {VVC.CLOSE_CHAN_REASON} reason  The reason for closing
 * @return {Boolean}                       Returns true on successful send
 */
VVCControlChannel.prototype.sendCloseChannel = function(channel, reason)
{
   var packet = this._createControlPacket(VVC.CTRL_OP.CLOSE_CHAN);
   packet.writeUint32(channel.id);
   packet.writeUint32(reason);
   return this._sendControlPacket(packet);
};


/**
 * Sends a VVC.CTRL_OP.CLOSE_CHAN message.
 *
 * Responds to a close channel request.
 *
 * @protected
 * @param  {VVCChannel}            channel The channel to close
 * @param  {VVC.CLOSE_CHAN_STATUS} status  The close acknowledgement status
 * @return {Boolean}                       Returns true on successful send
 */
VVCControlChannel.prototype.sendCloseChannelAck = function(channel, status)
{
   var packet = this._createControlPacket(VVC.CTRL_OP.CLOSE_CHAN_ACK);
   packet.writeUint32(channel.id);
   packet.writeUint32(status);
   return this._sendControlPacket(packet);
};


/**
 * Called when the control channel receives a message.
 * Reads the message header and forwards it to the correct handler function.
 * Implements VVCChannel~onmessage.
 *
 * @protected
 * @param {MessageEvent} evt
 */
VVCControlChannel.prototype.onmessage = function(evt)
{
   var packet = WMKS.Packet.createFromBuffer(evt.data);
   var opcode = packet.readUint8();
   var flags  = packet.readUint8();
   var param  = packet.readUint16();

   switch (opcode) {
      case VVC.CTRL_OP.INIT:
      case VVC.CTRL_OP.INIT_ACK:
         this._onInit(packet, opcode);
         break;
      case VVC.CTRL_OP.RTT:
         this._onRtt(packet);
         break;
      case VVC.CTRL_OP.RTT_ACK:
         this._onRttAck(packet);
         break;
      case VVC.CTRL_OP.OPEN_CHAN:
         this._onOpenChannel(packet);
         break;
      case VVC.CTRL_OP.OPEN_CHAN_ACK:
         this._onOpenChannelAck(packet);
         break;
      case VVC.CTRL_OP.CLOSE_CHAN:
         this._onCloseChannel(packet);
         break;
      case VVC.CTRL_OP.CLOSE_CHAN_ACK:
         this._onCloseChannelAck(packet);
         break;
      case VVC.CTRL_OP.RECV_ACK:
         this._onRecvAck(packet, param);
         break;
      default:
         this._session.onSessionError(VVC.STATUS.PROTOCOL_ERROR,
                                       'VVCControlChannel.onmessage',
                                       'Unknown control opcode: ' + opcode);
         return false;
   }

   return true;
};


/**
 * Called when we receive a VVC.CTRL_OP.RTT message.
 * Immediately replies with a VVC.CTRL_OP.RTT_ACK.
 *
 * @private
 * @param  {Packet}  packet  Incoming message packet
 * @return {Boolean} success Returns true on success
 */
VVCControlChannel.prototype._onRtt = function(packet)
{
   var ack;

   if (!this._checkErrorMinimumSize(VVC.CTRL_OP.RTT, packet)) {
      return false;
   }

   ack = this._createControlPacket(VVC.CTRL_OP.RTT_ACK);
   return this._sendControlPacket(ack);
};


/**
 * Called when we receive a VVC.CTRL_OP.RTT_ACK message.
 * Records the time taken for the RTT_ACK to arrive since we sent the request.
 *
 * @private
 * @param  {Packet}  packet  Incoming message packet
 * @return {Boolean} success Returns true on success
 */
VVCControlChannel.prototype._onRttAck = function(packet)
{
   if (!this._checkErrorMinimumSize(VVC.CTRL_OP.RTT_ACK, packet)) {
      return false;
   }

   this._session.addRttTime(Date.now() - this._rttSendTimeMS);
   return true;
};


/**
 * Called when we receive a VVC.CTRL_OP.RECV_ACK message.
 * Does nothing.
 *
 * @private
 * @param  {Packet}  packet  Incoming message packet
 * @return {Boolean} success Returns true on success
 */
VVCControlChannel.prototype._onRecvAck = function(packet, bytesReceived)
{
   if (!this._checkErrorMinimumSize(VVC.CTRL_OP.RECV_ACK, packet)) {
      return false;
   }

   return true;
};


/**
 * Check if a major+minor version is supported.
 *
 * @private
 * @param  {Number}  major   Major version
 * @param  {Number}  minor   Minor version
 * @return {Boolean} success Returns true if version is supported.
 */
VVCControlChannel.prototype._isVersionSupported = function(major, minor)
{
   if (VVC.MAJOR_VER == major && VVC.MINOR_VER == minor) {
      return true;
   }

   for (var i = 0; i < VVC.SUPPORTED_VER.length; ++i) {
      if (VVC.SUPPORTED_VER[i].MAJOR == major
       && VVC.SUPPORTED_VER[i].MINOR == minor) {
         return true;
      }
   }

   return false;
};


/**
 * Called when we receive a VVC.CTRL_OP.INIT or VVC.CTRL_OP.INIT_ACK message.
 * If receiving an INIT then responds with an INIT_ACK message.
 * Will trigger the listener.onconnect callback.
 *
 * @private
 * @param {VVC.CTRL_OP} opcode  The opcode, expected to be INIT or INIT_ACK
 * @param {Packet}      packet  The INIT / INIT_ACK packet
 * @return {Boolean}    success Returns true on success
 */
VVCControlChannel.prototype._onInit = function(packet, opcode)
{
   var major, minor, caps1, caps2;
   var extVersions = [];

   if (!this._checkErrorMinimumSize(opcode, packet)) {
      return false;
   }

   if (!this._checkErrorSessionState(opcode, VVC.SESSION_STATE.INIT)) {
      return false;
   }

   major = packet.readUint16();
   minor = packet.readUint16();
   caps1 = packet.readUint32();
   caps2 = packet.readUint32();

   if (major >= 2) {
      var extLen;

      if (!this._checkErrorRemainingSize(opcode, packet, 4)) {
         return false;
      }

      extLen = packet.readUint32();

      if (!this._checkErrorRemainingSize(opcode, packet, extLen)) {
         return false;
      }

      // Read extension data
      while (packet.bytesRemaining() >= 8) {
         var extType, extFlags, extParam, extDataLen,
             extVerMajor, extVerMinor, extVerFlags,
             extReadPos, extReadBytes;

         // Read extension header
         extType = packet.readUint16();
         extFlags = packet.readUint16();
         extParam = packet.readUint32();

         if (extFlags & VVC.INIT_EXT_FLAG.EDAT) {
            extDataLen = extParam;
         } else {
            extDataLen = 0;
         }

         if (!this._checkErrorRemainingSize(opcode, packet, extDataLen)) {
            return false;
         }

         // Save current bytes remaining so we can skip past unread extData
         extReadPos = packet.bytesRemaining();

         switch (extType) {
         case VVC.INIT_EXT_TYPE.VERSION:
            if (!this._checkErrorRemainingSize(opcode, packet, 8)) {
               return false;
            }

            extVerMajor = packet.readUint16();
            extVerMinor = packet.readUint16();
            extVerFlags = packet.readUint32();
            extVersions.push({ major: extVerMajor, minor: extVerMinor });
            break;
         case VVC.INIT_EXT_TYPE.PROBE:
            if (extParam & VVC.INIT_EXT_PROBE_FLAG.SUPPORTED) {
               this._session.createProbeChannel();
            }
            break;
         }

         // Ensure we have fully read the extension data
         extReadBytes = extReadPos - packet.bytesRemaining();

         if (extReadBytes < extDataLen) {
            packet.readArray(extDataLen - extReadBytes);
         }
      }
   }

   // Try to find a compatible version
   this.versionMajor = 0;
   this.versionMinor = 0;

   if (this._isVersionSupported(major, minor)) {
      this.versionMajor = major;
      this.versionMinor = minor;
   } else {
      for (var i = 0; i < extVersions.length; i++) {
         extVerMajor = extVersions[i].major;
         extVerMinor = extVersions[i].minor;

         if (this._isVersionSupported(extVerMajor, extVerMinor)) {
            if (extVerMajor >= this.versionMajor
             && extVerMinor >= this.versionMinor) {
               this.versionMajor = extVerMajor;
               this.versionMinor = extVerMinor;
            }
         }
      }
   }

   if (this.versionMajor == 0 && this.versionMinor == 0) {
      this._vvcInstance.setLastError(VVC.STATUS.PROTOCOL_ERROR,
                                     'VVCControlChannel._onInit',
                                     'Failed to negotiate compatible protocol '
                                     + ' version.');

      return false;
   }

   if (opcode === VVC.CTRL_OP.INIT) {
      this.sendInit(VVC.CTRL_OP.INIT_ACK);
   }

   this._session.onConnect();
   return true;
};


/**
 * Called when we receive a VVC.CTRL_OP.OPEN_CHAN message.
 * Will trigger the listener.onpeeropen callback.
 *
 * @private
 * @param  {Packet}  packet  Incoming message packet
 * @return {Boolean} success Returns true on success
 */
VVCControlChannel.prototype._onOpenChannel = function(packet)
{
   if (!this._checkErrorMinimumSize(VVC.CTRL_OP.OPEN_CHAN, packet)) {
      return false;
   }

   var name, initialData, channel,
       id             = packet.readUint32(),
       priority       = packet.readUint32(),
       flags          = packet.readUint32(),
       timeout        = packet.readUint32(),
       reserved       = packet.readUint16(),
       reserved2      = packet.readUint8(),
       nameLen        = packet.readUint8(),
       initialDataLen = packet.readUint32();

   if (!this._checkErrorMinimumSize(VVC.CTRL_OP.OPEN_CHAN, packet,
                                    nameLen + initialDataLen)) {
      return false;
   }

   name         = packet.readStringASCII(nameLen);
   initialData  = packet.readArray(initialDataLen);

   channel      = this._session.createChannel(id,
                                              name,
                                              priority,
                                              flags,
                                              timeout);
   channel.initialData = initialData;
   this._session.onPeerOpen(channel);
   return true;
};


/**
 * Called when we receive a VVC.CTRL_OP.OPEN_CHAN_ACK message.
 * Will trigger the channel.onopen callback.
 *
 * @private
 * @param  {Packet}  packet  Incoming message packet
 * @return {Boolean} success Returns true on success
 */
VVCControlChannel.prototype._onOpenChannelAck = function(packet)
{
   var id, status, initialDataLen, initialData;

   if (!this._checkErrorMinimumSize(VVC.CTRL_OP.OPEN_CHAN_ACK, packet)) {
      return false;
   }

   id             = packet.readUint32();
   status         = packet.readUint32();
   initialDataLen = packet.readUint32();

   if (!this._checkErrorMinimumSize(VVC.CTRL_OP.OPEN_CHAN_ACK, packet,
                                    initialDataLen)) {
      return false;
   }

   initialData = packet.readArray(initialDataLen);

   if (!this._checkErrorValidChannel(VVC.CTRL_OP.OPEN_CHAN_ACK, id,
                                     VVC.CHANNEL_STATE.INIT)) {
      return false;
   }

   this._session.onChannelOpen(this._session.getChannel(id),
                               status,
                               initialData);
   return true;
};


/**
 * Called when we receive a VVC.CTRL_OP.CLOSE_CHAN message.
 * Will trigger the channel.onclose callback.
 *
 * @private
 * @param  {Packet}  packet  Incoming message packet
 * @return {Boolean} success Returns true on success
 */
VVCControlChannel.prototype._onCloseChannel = function(packet)
{
   var id, reason;

   if (!this._checkErrorMinimumSize(VVC.CTRL_OP.CLOSE_CHAN, packet)) {
      return false;
   }

   id     = packet.readUint32();
   reason = packet.readUint32();

   if (!this._checkErrorValidChannel(VVC.CTRL_OP.CLOSE_CHAN, id)) {
      return false;
   }

   this._session.onChannelClose(this._session.getChannel(id), reason);
   return true;
};


/**
 * Called when we receive a VVC.CTRL_OP.CLOSE_CHAN_ACK message.
 * Will trigger the channel.onclose callback.
 *
 * @private
 * @param  {Packet}  packet  Incoming message packet
 * @return {Boolean} success Returns true on success
 */
VVCControlChannel.prototype._onCloseChannelAck = function(packet)
{
   var id, status;

   if (!this._checkErrorMinimumSize(VVC.CTRL_OP.CLOSE_CHAN_ACK, packet)) {
      return false;
   }

   id     = packet.readUint32();
   status = packet.readUint32();

   if (!this._checkErrorValidChannel(VVC.CTRL_OP.CLOSE_CHAN_ACK, id,
                                     VVC.CHANNEL_STATE.CLOSING)) {
      return false;
   }

   this._session.onChannelClose(this._session.getChannel(id),
                                status);

   return true;
};


/**
 * Checks that the size of the incoming packet is correct.
 * Triggers a session error if the size is unexpected.
 *
 * @private
 * @param  {VVC.CTRL_OP} opcode      The message opcode
 * @param  {Packet}      packet      The packet to check
 * @param  {Number}      [extraSize] Extra size needed
 * @return {Boolean}     success     Returns true on correct size
 */
VVCControlChannel.prototype._checkErrorMinimumSize = function(opcode,
                                                              packet,
                                                              extraSize)
{
   var packetSize = packet.length - 4;
   var expectSize = VVC.CTRL_OP.SIZE[opcode];
   extraSize      = extraSize || 0;

   if (packetSize < expectSize + extraSize) {
      var name = VVC.CTRL_OP.NAME[opcode];

      this._session.onSessionError(VVC.STATUS.PROTOCOL_ERROR,
                                    'VVCControlChannel._checkErrorMinimumSize',
                                    'Received invalid ' + name + ' message, '
                                     + 'message too small, received '
                                     + packetSize + ' bytes, expected '
                                     + expectSize + ' + ' + extraSize);
      return false;
   }

   return true;
};


/**
 * Checks that the remaining size of a packet is large enough.
 * Triggers a session error if the size is unexpected.
 *
 * @private
 * @param  {VVC.CTRL_OP} opcode      The message opcode
 * @param  {Packet}      packet      The packet to check
 * @param  {Number}      size        Size needed
 * @return {Boolean}     success     Returns true on valid size
 */
VVCControlChannel.prototype._checkErrorRemainingSize = function(opcode,
                                                                packet,
                                                                size)
{
   var remaining = packet.bytesRemaining();

   if (remaining < size) {
      var name = VVC.CTRL_OP.NAME[opcode];

      this._session.onSessionError(VVC.STATUS.PROTOCOL_ERROR,
                                    'VVCControlChannel._checkErrorRemainingSize',
                                    'Received invalid ' + name + ' message, '
                                     + 'message too small, expected '
                                     + (size - remaining) + ' more bytes.');
      return false;
   }

   return true;
};


/**
 * Checks the session state.
 * Triggers a session error if the state is invalid.
 *
 * @private
 * @param  {VVC.CTRL_OP}        opcode  The message opcode
 * @param  {VVC.SESSSION_STATE} state   The state to check
 * @return {Boolean}            success Returns true on valid session state
 */
VVCControlChannel.prototype._checkErrorSessionState = function(opcode,
                                                               state)
{
   var opname = VVC.CTRL_OP.NAME[opcode];

   if (this._session.state !== state) {
      this._session.onSessionError(VVC.STATUS.PROTOCOL_ERROR,
                                    'VVCControlChannel._checkErrorSessionState',
                                    'Received invalid ' + opname + ' message, '
                                     + 'invaild session state, '
                                     + 'found ' + this._session.state
                                     + ' expected ' + state);
      return false;
   }

   return true;
};


/**
 * Checks if the channel id is valid.
 * Ensures it is not the control channel.
 * Ensures channel exists.
 * Optionally checks the channel state;
 *
 * @private
 * @param  {VVC.CTRL_OP}       opcode  The message opcode
 * @param  {Number}            id      The channel id to check
 * @param  {VVC.CHANNEL_STATE} [state] The state the channel must be in
 * @return {Boolean}           success Returns true on valid channel id.
 */
VVCControlChannel.prototype._checkErrorValidChannel = function(opcode,
                                                               id,
                                                               state)
{
   var opname  = VVC.CTRL_OP.NAME[opcode];
   var channel = this._session.getChannel(id);

   if (id === VVC.CONTROL_CHANNEL_ID) {
      this._session.onSessionError(VVC.STATUS.PROTOCOL_ERROR,
                                    'VVCControlChannel._checkErrorValidChannel',
                                    'Received invalid ' + opname + ' message, '
                                     + 'unexpected use of control channel id');
      return false;
   }

   if (!channel) {
      this._session.onSessionError(VVC.STATUS.PROTOCOL_ERROR,
                                    'VVCControlChannel._checkErrorValidChannel',
                                    'Received invalid ' + opname + ' message, '
                                     + 'unknown channel ' + id);
      return false;
   }

   if (state !== undefined && channel.state !== state) {
      this._session.onSessionError(VVC.STATUS.PROTOCOL_ERROR,
                                    'VVCControlChannel._checkErrorValidChannel',
                                    'Received invalid ' + opname + ' message, '
                                     + 'unexpected channel state, '
                                     + 'found ' + channel.state + ' '
                                     + ' expected ' + state);
      return false;
   }

   return true;
};


/**
 * Creates a control packet.
 * Returns a new instance of Packet and inserts the control message header.
 *
 * @private
 * @param  {VVC.CTRL_OP} code
 * @param  {Number}      [flags]
 * @param  {Number}      [param]
 * @return {Packet}
 */
VVCControlChannel.prototype._createControlPacket = function(code, flags, param)
{
   var packet = WMKS.Packet.createNewPacket();

   param = param || 0;
   flags = flags || 0;

   packet.control = {
      code:  code,
      flags: flags,
      param: param
   };

   packet.writeUint8(code);
   packet.writeUint8(flags);
   packet.writeUint16(param);

   return packet;
};


/**
 * Send a control packet.
 * Automatically updates the length and data flag if required and then sends the
 * control packet using the normal VVCChannel.send.
 *
 * @private
 * @param  {Packet}  packet The packet to send
 * @return {Boolean}        Returns true on successful send
 */
VVCControlChannel.prototype._sendControlPacket = function(packet)
{
   if (packet.length > VVC.CTRL_HEADER_SIZE) {
      packet.control.flags |= VVC.CTRL_FLAG.ODAT;
      packet.control.param = packet.length - VVC.CTRL_HEADER_SIZE;
   }

   packet.setUint8(1, packet.control.flags);
   packet.setUint16(2, packet.control.param);

   return this.send(packet.getData());
};
