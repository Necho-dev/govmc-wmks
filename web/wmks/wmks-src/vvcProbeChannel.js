'use strict';

/**
 * This is only to be created by a VVCSession.
 *
 * @classdesc The probe channel created and owned by a VVCSession.
 *
 * @constructor
 * @protected
 * @extends {VVCChannel}
 * @param {VVCSession} session The session this probe channel belongs to
 * @return {VVCProbeChannel}
 */
var VVCProbeChannel = function(session)
{
   VVCChannel.call(this, session,
                   VVC.PROBE_CHANNEL_ID,
                   VVC.PROBE_CHANNEL_NAME,
                   0, 0, 0);

   this.state = VVC.CHANNEL_STATE.OPEN;
};


VVCProbeChannel.prototype = Object.create(VVCChannel.prototype);

/**
 * Probe channel id.
 *
 * @type {Number}
 * @readonly
 * @default
 */
VVC.PROBE_CHANNEL_ID = 1;


/**
 * Probe channel name.
 *
 * @type {String}
 * @readonly
 * @default
 */
VVC.PROBE_CHANNEL_NAME = 'vvcprobe';
