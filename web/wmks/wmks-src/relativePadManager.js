/*
 *------------------------------------------------------------------------------
 *
 * wmks/relativePadManager.js
 *
 *   The controller of relativepad widget.
 *
 *------------------------------------------------------------------------------
 */
(function() {
   'use strict';

   // Trackpad related constants.
   WMKS.CONST.RELATIVEPAD = {
      STATE: {
         idle:         0,
         click:        1,
         move:         3,
         scroll:       4
      }
   };

   WMKS.relativePadManager = function(widget, canvas) {
      // Call constructor so dialogManager's params are included here.
      WMKS.dialogManager.call(this);
      this._widget = widget;
      this._canvas = canvas;
      // Trackpad state machine.
      this.state = WMKS.CONST.RELATIVEPAD.STATE.idle;
      this.history = [];
      // Override default options with options here.
      $.extend(this.options,
               {
                  name: 'RELATIVEPAD',
                  speedControlMinMovePx: 5,
                  // Speed control for relative trackpad
                  accelerator:           10,
                  minSpeed:              1,
                  maxSpeed:              10
               });
      WMKS.LOGGER.warn('relativepad : ' + this.options.name);
   };

   WMKS.relativePadManager.prototype =  new WMKS.dialogManager();

   /*
    *---------------------------------------------------------------------------
    *
    * getRelativepadHtml
    *
    *    Function to get the relativepad html layout.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.getTrackpadHtml = function() {
      var str = '<div id="relativePad" class="relativepad-container">\
                   <div class="left-border"></div>\
                   <div id="relativePadSurface"></div>\
                   <div class="right-border"></div>\
                   <div class="bottom-border">\
                      <div class="button-container">\
                         <div id="relativepadLeft" class="button-left"></div>\
                         <div id="relativepadRight" class="button-right"></div>\
                      </div>\
                   </div>\
               </div>';

      return str;
   };


   /*
    *---------------------------------------------------------------------------
    *
    * create
    *
    *    This function initializes the relativepad dialog, toggle highlighting on close
    *    handler.
    *
    * HACK
    *    There is no easy way to determine close by menu click vs clicking close
    *    icon. Hence using the event.target to determine it was from clicking
    *    close icon. It will not work well when closeOnEscape is true. We don't
    *    need this on ipad, so its good.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.create = function() {
      var dialog,
          self = this;

      if (!this._widget ||
          !this._canvas) {
         WMKS.LOGGER.debug('Trackpad dialog creation has been aborted. Widget or Canvas is not ready.');
         return null;
      }

      dialog = $(this.getTrackpadHtml());
      dialog.dialog({
         autoOpen: false,
         closeOnEscape: true,
         resizable: false,
         position: {my: 'center', at: 'center', of: this._canvas},
         zIndex: 1000,
         draggable: true,
         dialogClass: 'relativepad-wrapper',
         close: function(e) {
            self.sendUpdatedState(false);
         },
         create: function(e) {
            self.layout($(this).parent());
         }
      });

      return dialog;
   };


   /*
    *---------------------------------------------------------------------------
    *
    * init
    *
    *    This function initializes the event handlers for the relativepad.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.init = function() {
      var dialog = this.dialog,
          self = this,
          relativepad,
          left,
          right;
      if (!dialog) {
         WMKS.LOGGER.debug('Relativepad init aborted. Dialog is not created successfully.');
         return;
      }

      // Request reposition of relativepad dialog upon orientation changes.
      this._widget.requestElementReposition(dialog.parent(), true);

      // Initialize event handlers for the relativepad.
      relativepad = dialog
         .find('#relativePadSurface')
         .on('mousemove', function(e) {
            return self.relativepadMouseMove(e.originalEvent);
         }).on('mouseup', function(e) {
            return self.relativepadMouseClick(e,0);
         }).on('mousedown', function(e) {
            return self.relativepadMouseClick(e,1);
         }).on('contextmenu',function(){
            return false;
         });
   };


   /*
    *---------------------------------------------------------------------------
    *
    * disconnect
    *
    *    This function unbinds the event handlers for the relativepad.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.disconnect = function() {
      var dialog = this.dialog,
          relativepad;

      if (!dialog) {
         return;
      }

      // Unregister event handlers for the relativepad.
      relativepad = dialog
         .find('#relativepadSurface')
         .off('mousemove')
         .off('mouseup')
         .off('mousedown');
   };

   /*
    *---------------------------------------------------------------------------
    *
    * layout
    *
    *    Reposition the dialog in order to center it to the canvas.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.layout = function(dialog) {
      var canvas = this._canvas,
          dialogParent,
          canvasParent;

      if (!dialog ||
          !canvas) {
         return;
      }

      dialogParent = dialog.parent();
      canvasParent = canvas.parent();

      if (dialogParent !== canvasParent) {
         // Append the dialog to the parent of the canvas,
         // so that it's able to center the dialog to the canvas.
         canvasParent.append(dialog);
      }
   };

   /*
    *---------------------------------------------------------------------------
    *
    * relativepadMouseMove
    *
    *    Fires when a mouse moves within the relative trackpad's  area. If the
    *    action is currently marked as a click, promotes it into a move. If it
    *    is already one or the other, stick to that type.
    *
    *    However, if the mouse moves outside the area while moving, then set the
    *    state back to the click and clear up history in case user comes back into
    *    the hot region.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.relativepadMouseMove = function(e) {
      var pX, pY, newLocation, diffLocation,
          self = $(e.target),
          widget = this._widget;
      if (this.state === WMKS.CONST.RELATIVEPAD.STATE.idle) {
         return false;
      }

      pX = e.pageX;
      pY = e.pageY;

      // Verify if the touchmove is outside business (hot) region of trackpad.
      if (pY < self.offset().top || pY > (self.offset().top + self.height()) ||
            pX < self.offset().left || pX > (self.offset().left + self.width())) {
         // Reset to tap start state, as the user went outside the business region.
         if (this.state === WMKS.CONST.RELATIVEPAD.STATE.move) {
            this.state = WMKS.CONST.RELATIVEPAD.STATE.idle;
            this.history.length = 0;
         }
         return false;
      }

      if (this.state === WMKS.CONST.RELATIVEPAD.STATE.move) {
         newLocation = this.computeNewCursorLocation(pX, pY);
         if (WMKS.VNCDecoder.cursorPosition) {
            diffLocation = this._widget.getRelativeMouseCanvasPosition(WMKS.VNCDecoder.cursorPosition);
            widget._relativeMouseHandler.moveCursor(diffLocation.x, diffLocation.y);
         }
         widget.sendMouseMoveMessage(newLocation);
         // Make room for a new history entry
         this.history.shift();

         // Push a new history entry
         this.history.push({x: pX, y: pY });
      }

      // Detect if this is a drag or a scroll. If so, add a history entry.
      if (this.state === WMKS.CONST.RELATIVEPAD.STATE.click) {
         this.state = WMKS.CONST.RELATIVEPAD.STATE.move;
         // Make up history based on the current point if there isn't any yet.
         this.history.push({x: pX, y: pY}, {x: pX, y: pY}, {x: pX, y: pY});
      }
      return false;
   };

   /*
    *---------------------------------------------------------------------------
    *
    * computeNewCursorLocation
    *
    *    This function takes the new location and computes the destination mouse
    *    cursor location. The computation is based on the acceleration to be used,
    *    making sure the new location is within the screen area.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.computeNewCursorLocation = function(pX, pY) {
      var dist,
          point = { x:0,y:0 };
      // First compute the distance from the last location.
      dist = WMKS.UTIL.getLineLength(
         (pX - this.history[2].x), (pY - this.history[2].y));
      if (isNaN(dist) || dist === 0) {
         // There is no change, return the old location.
         return point;
      } else if (dist < this.options.speedControlMinMovePx) {
         // The cursor has only moved a few pixels, apply the delta directly.
         point.x = pX - this.history[2].x;
         point.y = pY - this.history[2].y;
      } else {
         // From now on, though, use device pixels (later, compensate for hi-DPI)
         dist = this.computeMovingDistance(pX, pY);
         point.x = Math.floor(dist[0]);
         point.y = Math.floor(dist[1]);
      }
      return point;
   };

   /*
    *---------------------------------------------------------------------------
    *
    * computeMovingDistance
    *
    *    Based on a current point and point history, gets the amount of distance
    *    the mouse should move based on this data.
    *
    * Results:
    *    A 2-tuple of (dx, dy)
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.computeMovingDistance = function(x, y) {
      var dx, dy, dist, speed;

      dx = this.getTrackpadSpeed(x,
         this.history[0].x,
         this.history[1].x,
         this.history[2].x);
      dy = this.getTrackpadSpeed(y,
         this.history[0].y,
         this.history[1].y,
         this.history[2].y);

      dist = WMKS.UTIL.getLineLength(dx, dy);

      speed = dist * this.options.accelerator;
      if (speed > this.options.maxSpeed) {
         speed = this.options.maxSpeed;
      } else if (speed < this.options.minSpeed) {
         speed = this.options.minSpeed;
      }

      return [dx * speed, dy * speed];
   };

   /*
    *---------------------------------------------------------------------------
    *
    * getTrackpadSpeed
    *
    *    Performs a linear least squares operation to get the slope of the line
    *    that best fits all four points. This slope is the current speed of the
    *    trackpad, assuming equal time between samples.
    *
    *    Returns the speed as a floating point number.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.getTrackpadSpeed = function(x0, x1, x2, x3) {
      return x0 * 0.3 + x1 * 0.1 - x2 * 0.1 - x3 * 0.3;
   };
   /*
    *---------------------------------------------------------------------------
    *
    * relativepadMouseClick
    *
    *    Fires when either one of the virtual trackpad's buttons are clicked. Sends
    *    a mousedown operation and adds the button highlight.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.relativepadMouseClick = function(event, down) {
      if (this.state == WMKS.CONST.RELATIVEPAD.STATE.idle) {
         this.state = WMKS.CONST.RELATIVEPAD.STATE.click;
         return false;
      } else {
         this.state = WMKS.CONST.RELATIVEPAD.STATE.click;
         var evt = event || window.event;
         var pos = { x:0, y:0 };
         var bmask;

         /* evt.which is valid for all browsers except IE */
         if (evt.which) {
            if (evt.which == 1) {
               bmask = 0x01; //left button
            } else if (evt.which == 2) {
               bmask = 0x04; //middle button
            } else if (evt.which == 3) {
               bmask = 0x02; //right button
            }
         } else {
            /* IE including 9 */
            if (evt.button == 0) {
               bmask = 0x01; //left button
            } else if (evt.button == 1) {
               bmask = 0x04; //middle button
            } else if (evt.button == 2) {
               bmask = 0x02; //right button
            }
         }
         // Sends a mousedown message.
         this._widget.sendMouseButtonMessage(pos, down, bmask);
         this.resetRelativepadState();
         return false;
      }

   };

   /*
    *---------------------------------------------------------------------------
    *
    *    resetRelativepadState
    *
    *    Resets the virtual relative trackpad's state machine.
    *
    *---------------------------------------------------------------------------
    */

   WMKS.relativePadManager.prototype.resetRelativepadState = function() {
      this.history.length = 0;
   };

}());