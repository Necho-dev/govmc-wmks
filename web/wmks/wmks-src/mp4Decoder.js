/*********************************************************
 * Copyright (C) 2015 VMware, Inc. All rights reserved.
 *********************************************************/

/*
 * wmks/mp4Decoder.js
 *
 *   WebMKS MP4 decoder prototype.
 *
 */

function MP4Decoder() {
   this._mediaSource = null;
   this._sourceBuffer = null;
   this._tempQueue = [];
   this._mediaPlayer = null;
   this._isError = false;
   this._isErrorDoneCalled = false;
   this._sendRequest= 0;
   this._doneRequest= 0;
   this._decodeDoneCb = null;
   this._decodeErrorCb = null;
   MP4Decoder.instanceNumber++;
   this._name = "MP4Decoder" + MP4Decoder.instanceNumber;
};

MP4Decoder.instanceNumber = 0;
MP4Decoder.byteStreamFormat = 'video/mp4; codecs="avc1.640030"';

MP4Decoder.prototype.toString = function() {
   return this._name;
};


/*
 *------------------------------------------------------------------------------
 *
 * _init
 *
 *    Generate a Media Source object and associate it with video DOM element.
 *
 * Side Effects:
 *    None.
 *
 *------------------------------------------------------------------------------
 */

MP4Decoder.prototype.init = function(mediaPlayer, urlObject, mediaSourceObject,
                                     decodeDoneCb, decodeErrorCb) {
   var self = this,
       URL = urlObject || window.URL || window.webkitURL,
       MediaSource = mediaSourceObject || window.MediaSource || window.WebKitMediaSource;

   this.reset();

   this._decodeDoneCb = decodeDoneCb;
   this._decodeErrorCb = decodeErrorCb;
   this._mediaPlayer = mediaPlayer;
   this._mediaSource = new MediaSource();
   // Attach a media source object to HTMLMediaElement.
   this._mediaPlayer.src = URL.createObjectURL(this._mediaSource);
   this._mediaSource.addEventListener('sourceopen',
   function(e) {
      return self._onMediaSourceOpen(e);
   }, false);
   this._mediaSource.addEventListener('webkitsourceopen',
   function(e) {
      return self._onMediaSourceOpen(e);
   }, false);
};


/*
 *------------------------------------------------------------------------------
 *
 * _onMediaSourceOpen
 *
 *       After media source is open, create a source buffer with MP4 decoder and
 *    attach it to media source object. If there is any MP4 data in the buffer,
 *    add it to source buffer so that media source can play it.
 *
 * Side Effects:
 *    None.
 *
 *------------------------------------------------------------------------------
 */

MP4Decoder.prototype._onMediaSourceOpen = function (e) {
   var self = this;

   WMKS.LOGGER.log(this + " media source status is changed to open.");

   if (this._mediaSource.readyState !== "open") {
      WMKS.LOGGER.log(this + " media source is not open yet.");
      return;
   }

   this._sourceBuffer = this._mediaSource.addSourceBuffer(
      MP4Decoder.byteStreamFormat);

   /*
    * Listen to update event. It will fire after current buffer data is
    * handled by media source object.
    */
   this._sourceBuffer.addEventListener('updateend', function () {
      if (self._tempQueue.length === 0) {
         return;
      }

      if (self._tempQueue[0].method === "add" && self._decodeDoneCb) {
         self._doneRequest++;
         WMKS.LOGGER.debug(self + " request track: send " + self._sendRequest +
                           " done " + self._doneRequest);
         self._decodeDoneCb();
      }

      self._tempQueue.shift();
      self._flushPayloads();
   });

   this._sourceBuffer.addEventListener('error', function(e) {
      WMKS.LOGGER.error(self + " error code is " + e);
   });
   // If we receive any MP4 during MediaSource initialization process, decode it now.
   this._flushPayloads();
   return;
};


/*
 *------------------------------------------------------------------------------
 *
 * _flushPayloads
 *
 *    Append all the data in our temp buffer to sourceBuffer object.
 *
 * Side Effects:
 *    Display MP4 video.
 *
 *------------------------------------------------------------------------------
 */

MP4Decoder.prototype._flushPayloads = function () {
   var bufferStart = 0,
       bufferEnd = 0,
       removeEnd = 0;
   if (!this._sourceBuffer) {
      WMKS.LOGGER.log(this + "source buffer is not ready yet.");
      return;
   }

   if (this._tempQueue.length === 0) {
      return;
   }

   if (this._mediaSource.readyState === "open" &&
       !this._sourceBuffer.updating) {
      try {
         if (this._tempQueue[0].method === "add") {
            this._sourceBuffer.appendBuffer(this._tempQueue[0].payload);
         } else if (this._tempQueue[0].method === "remove") {
            bufferStart = this._sourceBuffer.buffered.start(0);
            bufferEnd = this._sourceBuffer.buffered.end(0);
            removeEnd = this._mediaPlayer.currentTime - 0.5;
            WMKS.LOGGER.log(this + " status:  start " + bufferStart +
                            " end " + bufferEnd + " with current time " +
                            this._mediaPlayer.currentTime);
            if (removeEnd > bufferStart) {
               WMKS.LOGGER.log(this + " start to remove from " +
                               bufferStart + " to " + removeEnd);
               this._sourceBuffer.remove(bufferStart, removeEnd);
            } else {
               WMKS.LOGGER.log(this + " it is too close to clear buffer.");
               this._tempQueue.shift();
               throw "close buffer";
            }
         }
      } catch (e) {
         if (e.name === "QuotaExceededError") {
            var self = this;
            WMKS.LOGGER.log(this + " browser is full.");
            setTimeout(function(){
               self._tempQueue.unshift({method: "remove"});
               self._flushPayloads();
            }, 0);
         } else {
            WMKS.LOGGER.error(this + " encounters a unrecoverable error. " + e);
            this._isError = true;

            if (this._decodeDoneCb) {
               this._decodeDoneCb();
            }

            if (this._decodeErrorCb && !this._isErrorDoneCalled) {
               this._isErrorDoneCalled = true;
               this._decodeErrorCb();
            }
         }
      }
   }
};


/*
 *------------------------------------------------------------------------------
 *
 * reset
 *
 *    Reset all the resources used by MP4 Decoder object.
 *
 * Side Effects:
 *    None.
 *
 *------------------------------------------------------------------------------
 */

MP4Decoder.prototype.reset = function() {
   WMKS.LOGGER.log(this + " is reset.");
   if (this._mediaSource) {
      if (this._sourceBuffer) {
         this._mediaSource.removeSourceBuffer(this._sourceBuffer);
         this._sourceBuffer = null;
      }

      /*
       * Only end the stream if media source is open. Otherwise
       * Chrome browser will throw exception.
       */
      if (this._mediaSource.readyState === "open") {
         this._mediaSource.endOfStream();
      }
      this._mediaSource = null;
   }

   if (this._mediaPlayer) {
      this._mediaPlayer.src = "";
      this._mediaPlayer = null;
   }

   this._sendRequest= 0;
   this._doneRequest= 0;
   this._decodeDoneCb = null;
   this._decodeErrorCb = null;
   this._isError = false;
   this._isErrorDoneCalled = false;
   this._tempQueue = [];
};


/*
 *------------------------------------------------------------------------------
 *
 * appendData
 *
 *    Append MP4 data to media source object. If media source is not ready, put
 *    it into temporary buffer.
 *
 * Side Effects:
 *    Display MP4 video.
 *
 *------------------------------------------------------------------------------
 */

MP4Decoder.prototype.appendData = function(payload) {
   if (this._isError) {
      WMKS.LOGGER.log(this + " is in error state.");
      if (this._decodeDoneCb) {
         this._decodeDoneCb();
      }
      return;
   }

   this._sendRequest++;

   this._tempQueue.push({method: "add", payload: payload});
   this._flushPayloads();

   if (this._mediaPlayer && this._mediaPlayer.paused) {
      var playPromise = this._mediaPlayer.play();

      if (playPromise !== undefined) {
         playPromise.catch(function(error) {
            WMKS.LOGGER.debug("MP4 video play error: " + error);
         });
      }
   }
};