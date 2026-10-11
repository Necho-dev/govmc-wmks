// Use the following for js-lint.
/*global WMKS:false */

/*
 *------------------------------------------------------------------------------
 *
 * wmks/KeyboardManager2.js
 *
 *   A keyboard manager which uses keyboardEvent.code to get the VSCAN code
 *   pressed on the client and send it directly to the server.
 *
 *------------------------------------------------------------------------------
 */

WMKS.CONST.KB2 = {
   LedKeys: [
      WMKS.VSCAN_CODES.VSCAN_CAPSLOCK,
      WMKS.VSCAN_CODES.VSCAN_NUMLOCK,
      WMKS.VSCAN_CODES.VSCAN_SCROLL,
   ],

   GuiKeys: [
      WMKS.VSCAN_CODES.VSCAN_LGUI,
      WMKS.VSCAN_CODES.VSCAN_RGUI,
   ],

   ControlKeys: [
      WMKS.VSCAN_CODES.VSCAN_LCONTROL,
      WMKS.VSCAN_CODES.VSCAN_RCONTROL,
   ],

   ModifierKeys: [
      WMKS.VSCAN_CODES.VSCAN_LGUI,
      WMKS.VSCAN_CODES.VSCAN_RGUI,
      WMKS.VSCAN_CODES.VSCAN_LCONTROL,
      WMKS.VSCAN_CODES.VSCAN_RCONTROL,
      WMKS.VSCAN_CODES.VSCAN_LSHIFT,
      WMKS.VSCAN_CODES.VSCAN_RSHIFT,
      WMKS.VSCAN_CODES.VSCAN_LALT,
      WMKS.VSCAN_CODES.VSCAN_RALT,
   ],

   NumberPadKeysUnlocked: [
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_Decimal,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_0,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_1,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_2,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_3,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_4,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_5,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_6,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_7,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_8,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_UNLOCKED_9,
   ],

   NumberPadKeysLocked: [
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_Decimal,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_0,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_1,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_2,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_3,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_4,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_5,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_6,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_7,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_8,
      WMKS.NUMPAD_KEYCODE.NUMLOCK_LOCKED_9,
   ]
};

WMKS.KeyboardManager2 = function(options) {
   'use strict';
   if (!options || !options.vncDecoder) {
      return null;
   }

   this._vncDecoder = options.vncDecoder;

   this._serverKeyboardLeds = 0;

   this._guiToCtrlVScanMap = options.mapMetaToCtrlForVScans || {};
   this._enableWindowsKey = options.enableWindowsKey || false;

   this._clientModifierStatus = {};
   this._serverModifierStatus = {};
   this._ledInPending = {};
   this._ledPendingTimer = {};

   this._isNumLockKeyStatusChecked = false;
   this._isNumLockApiWork = true;
   this._NumLockKeyStatusForSamsung = false;
   this._NumLockStatusForMac = false;

   /*
    *---------------------------------------------------------------------------
    *
    * onKeyDown
    *
    *    Called when a key has been pressed down on the client. Do any required
    *    processing and forward the VSCAN code to the server.
    *
    * Results:
    *    true if the key is not handled by us.
    *
    *---------------------------------------------------------------------------
    */
   this.onKeyDown = function(e) {
      var code = e.originalEvent.code;
      if (WMKS.BROWSER.isSafari()) {
         if (e.originalEvent.code === "IntlBackslash") {
            if ((e.originalEvent.keyCode === 192 && e.originalEvent.key === "Dead") ||
               (e.originalEvent.keyCode === 219 && e.originalEvent.key === "[") ||
               (e.originalEvent.keyCode === 219 && e.originalEvent.key === "{") ||
               (e.originalEvent.keyCode === 192 && e.originalEvent.key === "°") ||
               (e.originalEvent.keyCode === 192 && e.originalEvent.key === "„") ||
               (e.originalEvent.keyCode === 221 && e.originalEvent.key === "]"))  {
                  // 1st check is for bug 2669906 on DE keyboard
                  // 2nd check is for bug 2662648 on ES keyboard
                  // 3rd check is for bug 2662648 on ES keyboard, AltGr + °
                  // 4th check is for bug 2669906 on DE keyboard, shift + °
                  // 5th check is for bug 2669906 on DE keyboard, RightAlt + ^
                  // 6th check is for bug 2687735 on ES keyboard, Shift+º
                  code = "Backquote";
            }
         } else if (e.originalEvent.code === "Backquote") {
            if ((e.originalEvent.keyCode === 188 && e.originalEvent.key === "<") ||
               (e.originalEvent.keyCode === 190 && e.originalEvent.key === ">") ||
               (e.originalEvent.keyCode === 188 && e.originalEvent.key === "≤") ||
               (e.originalEvent.keyCode === 219 && e.originalEvent.key === "[") ||
               (e.originalEvent.keyCode === 192 && e.originalEvent.key === "<")){
                  // ist check is for bug 2669906 on DE keyboard, key <
                  // 2nd check is for bug 2669906 on DE keyboard, shift + >
                  // 3rd check is for bug 2669906 on DE keyboard, RightAlt + <
                  // 4th check is for bug 2687735 on ES keyboard, RightAlt + <
                  // 45h check is for bug 2687735 on ES keyboard, Ctrl + Alt + <
                  code = "IntlBackslash";
            }
         }
      }
      var vScanCode = WMKS.keyboardUtils.fromKeyCodeToVScanCode[code];
      var stopChromeOSPreventEvent = WMKS.BROWSER.isChromeOS() &&
         (vScanCode === WMKS.VSCAN_CODES.VSCAN_EQUALS
            || vScanCode === WMKS.VSCAN_CODES.VSCAN_MINUS
            || vScanCode === WMKS.VSCAN_CODES.VSCAN_0
            || vScanCode === WMKS.VSCAN_CODES.VSCAN_BROWSER_REFRESH)
         && e.originalEvent.shiftKey && e.originalEvent.ctrlKey;

      // Enable to use ctrl + shift + "+", "-" ,"0", "rotate" shortcut keys in Chrome OS
      if(!stopChromeOSPreventEvent) {
         // Never let the browser default key handling run
         e.preventDefault();
         e.stopPropagation();
      }

      if (vScanCode === undefined) {
         console.warn("onKeyDown: Fail to find the vScanCode for " + code);
         return false;
      }

      // On MacOS, Chrome and SamsungTv, numlock will not send to server,
      // more detals please see this.checkKeyboardLedSync() function
      this.isNumLockApiWork(e);

      if ((WMKS.BROWSER.isChromeOS() || !this._isNumLockApiWork)
         && vScanCode == WMKS.VSCAN_CODES.VSCAN_NUMLOCK) {
         //!this._isNumLockApiWork is response for numkey behaviors the same as Samsung
         return false;
      }

      if (WMKS.BROWSER.isMacOS() && vScanCode === WMKS.VSCAN_CODES.VSCAN_NUMLOCK) {
         this._NumLockStatusForMac = !this._NumLockStatusForMac;
         WMKS.LOGGER.debug("chnge numlock status for mac to " + this._NumLockStatusForMac);
         return false;
      }

      if (WMKS.CONST.KB2.ModifierKeys.indexOf(vScanCode) !== -1) {
         this._clientModifierStatus[vScanCode] = true;
      }

      if (WMKS.BROWSER.isChromeOS()) {
         if(vScanCode === WMKS.VSCAN_CODES.VSCAN_LALT ||
            vScanCode === WMKS.VSCAN_CODES.VSCAN_RALT
            ) {
            if(this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI]) {
               this._clientModifierStatus[vScanCode] = false;
               this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI] = false;
            }
            return false;
         }
         if (vScanCode === WMKS.VSCAN_CODES.VSCAN_LGUI) {
            if(this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LALT]) {
               this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LALT] = false;
            }
            if(this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RALT]) {
               this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RALT] = false;
            }
         } else {
            if(this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LALT]) {
               this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_LALT, true);
               this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LALT] = false;
            }
            if(this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RALT]) {
               this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_RALT, true);
               this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RALT] = false;
            }
            if(this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI]) {
               this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI] = false;
            }
         }
      }

      this.checkKeyboardLedSync(e, vScanCode);

      if (this._enableWindowsKey
          && (WMKS.CONST.KB2.ControlKeys.indexOf(vScanCode) !== -1
              || WMKS.CONST.KB2.GuiKeys.indexOf(vScanCode) !== -1)) {
         if (this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LCONTROL]
             && this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI]) {
            // Translate LCtrl+LGui into LGui
            if (this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_LCONTROL]) {
               this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_LCONTROL, false);
            }

            if (!this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI]) {
               this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_LGUI, true);
            }

            return false;
         }

         if (this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RCONTROL]
             && this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RGUI]) {
            // Translate RCtrl+RGui into RGui
            if (this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_RCONTROL]) {
               this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_RCONTROL, false);
            }

            if (!this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_RGUI]) {
               this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_RGUI, true);
            }

            return false;
         }
      }

      if (this._guiToCtrlVScanMap.indexOf(vScanCode) !== -1) {
         // Translate Gui+X into Cmd+X for keys in _guiToCtrlVScanMap
         if (this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI]
             && !this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_LCONTROL]) {
            this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_LCONTROL, true);
         }

         if (this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RGUI]
             && !this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_RCONTROL]) {
            this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_RCONTROL, true);
         }
      }

      if (WMKS.CONST.KB2.GuiKeys.indexOf(vScanCode) !== -1) {
         // Never send a client gui key event to server, we will only ever do it
         // ourselves in the code above
         return false;
      }

      if (WMKS.BROWSER.isWindows()) {
         /* HACK: Windows handles Alt Right differently to everyone else by
          * throwing in Control Left with it. In order to be compatible with
          * any agent OS (such as a Windows web client connecting to a Linux
          * agent), we want to only send a Right Alt key without Control Left.
          */
         if (vScanCode == WMKS.VSCAN_CODES.VSCAN_RALT) {
            if (this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_LCONTROL]) {
               this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_LCONTROL, false);
            }
         } else if (e.originalEvent.getModifierState("AltGraph") &&
                    !this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_RALT]) {
            // HACK: This is possible to hit on Windows Firefox where we must
            // send a Right Alt up when we see a Control Left up.
            this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_RALT, true);
         }
      }

      this.sendVScanKey(vScanCode, true);

      if (WMKS.BROWSER.isMacOS()) {
         // MacOS only sends a down event for capslock, so we must send an up
         // event
         if (vScanCode == WMKS.VSCAN_CODES.VSCAN_CAPSLOCK) {
            this.sendVScanKey(vScanCode, false);
         }
         // MacOS only sends a down event for non-modifier keys when Meta is
         // held, so we should immediately send an up event
         if ((this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI]
              || this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RGUI])
             && WMKS.CONST.KB2.ModifierKeys.indexOf(vScanCode) == -1) {
            this.sendVScanKey(vScanCode, false);
         }
      }

      if(!stopChromeOSPreventEvent) {
         return false;
      } else {
         return e.returnValue;
      }
   };


   /*
    *---------------------------------------------------------------------------
    *
    * onKeyPress
    *
    *    This can only be called when onKeyDown returns true in the case that
    *    there was an unknown vScanCode encountered.
    *
    * Results:
    *    false to disable default handling.
    *
    *---------------------------------------------------------------------------
    */

   this.onKeyPress = function(e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
   };


   /*
    *---------------------------------------------------------------------------
    *
    * onKeyUp
    *
    *    Called when a key has been released on the client. Do any required
    *    processing and forward the VSCAN code to the server.
    *
    * Results:
    *    true if the key is not handled by us, false otherwise.
    *
    *---------------------------------------------------------------------------
    */

   this.onKeyUp = function(e) {
      var code = e.originalEvent.code;
      /* for Firefox browser in MacOS, it always treat "insert" key as "help" key
       * and trigger onkeyup() event but not onkeydown() event
       * so the insert key cannot work in MacOS Firefox
       * as a workaround, we set "help" key to "insert" key and should treat it as
       * onkeydown() event
       * the detail you can find in bug 2511264
       */
      if (WMKS.BROWSER.isMacOS() && WMKS.BROWSER.isFirefox() && code === "Help") {
         code = "Insert";
      }
      var vScanCode = WMKS.keyboardUtils.fromKeyCodeToVScanCode[code];

      // Never let the browser default key handling run
      e.preventDefault();
      e.stopPropagation();

      if (vScanCode === undefined) {
         console.warn("onKeyUp: Fail to find the vScanCode for " + code);
         return false;
      }
      if (WMKS.BROWSER.isChromeOS()) {
         if(vScanCode === WMKS.VSCAN_CODES.VSCAN_LALT
          || vScanCode === WMKS.VSCAN_CODES.VSCAN_RALT) {
            if(this._clientModifierStatus[vScanCode]){
               this.sendVScanKey(vScanCode, true);
            }
         }
      }

      //For Win10 there is no keydown for E when presing Ctrl + Windows + E，
      //So send a down for E first when getting a keyup from E on Win10
      //See bug 2411469
      if (this._enableWindowsKey
         && vScanCode === WMKS.VSCAN_CODES.VSCAN_E && WMKS.BROWSER.isWindows10()) {
         if (this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LCONTROL]
            && this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI]) {
            this.sendVScanKey(vScanCode, true)
         }
      }

      // MacOS and ChromeOS behave as if NumLock is always held down.
      if ((WMKS.BROWSER.isChromeOS() || !this._isNumLockApiWork)
         && vScanCode == WMKS.VSCAN_CODES.VSCAN_NUMLOCK) {
         return false;
      }

      if (WMKS.CONST.KB2.ModifierKeys.indexOf(vScanCode) !== -1) {
         this._clientModifierStatus[vScanCode] = false;
      }

      if (WMKS.CONST.KB2.ControlKeys.indexOf(vScanCode) !== -1
          || WMKS.CONST.KB2.GuiKeys.indexOf(vScanCode) !== -1
          || this._guiToCtrlVScanMap.indexOf(vScanCode) !== -1) {
         // If server has Gui key and client does not hold Ctrl+Gui then release
         // Gui
         if (this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI]
             && (!this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LGUI]
                 || !this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LCONTROL])) {
            this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_LGUI, false);
         }

         if (this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_RGUI]
             && (!this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RGUI]
                 || !this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RCONTROL])) {
            this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_RGUI, false);
         }

         // If client Ctrl state does not match server, update server
         if (!!this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LCONTROL]
             != !!this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_LCONTROL]) {
            this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_LCONTROL,
                              !!this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_LCONTROL]);
         }

         if (!!this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RCONTROL]
             != !!this._serverModifierStatus[WMKS.VSCAN_CODES.VSCAN_RCONTROL]) {
            this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_RCONTROL,
                              !!this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RCONTROL]);
         }

         if (WMKS.BROWSER.isWindows() && WMKS.BROWSER.isFirefox()) {
            // HACK: Windows Firefox does not send Right Alt Up, only Control
            // Left Up.
            if (vScanCode == WMKS.VSCAN_CODES.VSCAN_LCONTROL &&
                !!this._clientModifierStatus[WMKS.VSCAN_CODES.VSCAN_RALT]) {
               this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_RALT, false);
            }
         }

         if (WMKS.CONST.KB2.ControlKeys.indexOf(vScanCode) !== -1
             || WMKS.CONST.KB2.GuiKeys.indexOf(vScanCode) !== -1) {
            // Ctrl and Gui key has been handled, do not pass through to sendVScanKey
            return false;
         }
      }
      if (WMKS.BROWSER.isWindows() && vScanCode === WMKS.VSCAN_CODES.VSCAN_PRINT) {
         // HACK: Windows PrtScn button does not send key down, only keyUp.
         this.sendVScanKey(vScanCode, true);
         this.sendVScanKey(vScanCode, false);
         return false;
      }

      /* for Firefox browser in MacOS, it always treat "insert" key as "help" key
       * and trigger onkeyup() event but not onkeydown() event
       * so the insert key cannot work in MacOS Firefox
       * as a workaround, we set "help" key to "insert" key and should treat it as
       * onkeydown() event
       * the detail you can find in bug 2511264
       */
      if (WMKS.BROWSER.isMacOS() && WMKS.BROWSER.isFirefox() && code === "Insert") {
         this.sendVScanKey(vScanCode, true);
      } else {
         this.sendVScanKey(vScanCode, false);
      }
      return false;
   };

   var unlockedNumPadKeyCode = WMKS.CONST.KB2.NumberPadKeysUnlocked;
   var lockedNumPadKeyCode = WMKS.CONST.KB2.NumberPadKeysLocked;

   this.isNumLockApiWork = function(e) {
      if (!this._isNumLockKeyStatusChecked) {
         // This function will be called for once
         // when Numpad is pressed as numlock enabled
         if (e.originalEvent.code.indexOf("Numpad") !== -1) {
            if (lockedNumPadKeyCode.indexOf(e.originalEvent.keyCode) > -1) {
               //In this case, it is under numLock enabled
               //if e.originalEvent.getModifierState("NumLock") is false,
               //it means this api doesn't work.
               this._isNumLockApiWork = e.originalEvent.getModifierState("NumLock");
               this._isNumLockKeyStatusChecked = true;
               WMKS.LOGGER.debug("NumLock api works? " + this._isNumLockApiWork);
            }
         }
      }
   };

   this.getNumLockStat = function(e) {
      /*
      * SamsungTV can't detect the status of numlock key.
      * When the status of NumLock key is changed, e.originalEvent.keyCode also changes.
      * So detect the keyCode to check the NumLock status.
      */
      if (e.originalEvent.code.indexOf("Numpad") !== -1) {
         if (lockedNumPadKeyCode.indexOf(e.originalEvent.keyCode) > -1) {
            //In this case, it is under numLock enabled
            // Numpad number key is from 96 to 105, the del key is 110
            this._NumLockKeyStatusForSamsung = true;
         } else if (unlockedNumPadKeyCode.indexOf(e.originalEvent.keyCode) > -1) {
            this._NumLockKeyStatusForSamsung = false;
         }
      }

      return this._NumLockKeyStatusForSamsung;
   };

   /*
    *---------------------------------------------------------------------------
    *
    * checkKeyboardLedSync
    *
    *    If required, checks and fixes the synchronisation of the keyboard LED
    *    keys between client and server.
    *
    *---------------------------------------------------------------------------
    */
   this.checkKeyboardLedSync = function(e, vScanCode) {
      var modCapsLock = e.originalEvent.getModifierState("CapsLock");
      var serverCapsLock = !!(this._serverKeyboardLeds &
                              WMKS.KBD_LEDS.KBD_LED_CAPS_LOCK);

      var modNumLock = this._isNumLockApiWork?
         e.originalEvent.getModifierState("NumLock") : this.getNumLockStat(e);
      // MacOS and ChromeOS behave as if NumLock is always held down.
      if (WMKS.BROWSER.isChromeOS()) {
         modNumLock = true;
      }

      if (WMKS.BROWSER.isMacOS()) {
         var newModNumLock = !this._NumLockStatusForMac;
         if (newModNumLock !== modNumLock) {
            modNumLock = newModNumLock ;
            WMKS.LOGGER.trace("modnumlock is " + modNumLock);
         }
      }

      var serverNumLock = !!(this._serverKeyboardLeds &
         WMKS.KBD_LEDS.KBD_LED_NUM_LOCK);

      var modScrollLock = e.originalEvent.getModifierState("ScrollLock");
      var serverScrollLock = !!(this._serverKeyboardLeds &
                                WMKS.KBD_LEDS.KBD_LED_SCROLL_LOCK);

      if (WMKS.CONST.KB2.LedKeys.indexOf(vScanCode) !== -1) {
         if (!e.repeat) {
            /* We only try to sync on the first key press for LED keys, this
             * prevents us from toggling on & off when the user is holding
             * down an LED key
             */
            return;
         }

         /* LED keys have updated the getModifierState before the key has been
          * processed by the server, so in effect we need to invert their status
          * to truely know if our client status currently matches the server
          * status.
          */
         modCapsLock = !modCapsLock;
         modNumLock = !modNumLock;
         modScrollLock = !modScrollLock;
      }

      /**
       * See bug 2683076
       * Caps Lock is more pressed with other keys press right after, thus only
       * pausing state correction for capts lock here, since other keys would suffer
       * from the same issue in much cornerer case.
       */
      if (modCapsLock !== serverCapsLock && !this._ledInPending[WMKS.VSCAN_CODES.VSCAN_CAPSLOCK]) {
         this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_CAPSLOCK, true);
         this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_CAPSLOCK, false);
      }

      if (modNumLock !== serverNumLock) {
         this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_NUMLOCK, true);
         this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_NUMLOCK, false);
      }

      if (modScrollLock !== serverScrollLock) {
         this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_SCROLL, true);
         this.sendVScanKey(WMKS.VSCAN_CODES.VSCAN_SCROLL, false);
      }
   };


   /*
    *---------------------------------------------------------------------------
    *
    * processInputString
    *
    *    Not supported.
    *
    *---------------------------------------------------------------------------
    */

   this.processInputString = function(str, processNewline) {
      console.warn("processInputString is not supported by vscan keyboard.");
   };


   /*
    *---------------------------------------------------------------------------
    *
    * sendKey
    *
    *    Use sendVScanKey instead.
    *
    *---------------------------------------------------------------------------
    */

   this.sendKey = function(key, isUp, isUnicode) {
      console.warn("sendKey is not supported by vscan keyboard.");
   };


   /*
    *---------------------------------------------------------------------------
    *
    * enableWindowsKey
    *
    *    Enable/disable the simulation of Windows key.
    *    Press Ctrl+Win on Windows or Ctrl+CMD on Mac to simulate Windows key.
    *
    *---------------------------------------------------------------------------
    */

   this.enableWindowsKey = function(value) {
      this._enableWindowsKey = value;
   };


   /*
    *---------------------------------------------------------------------------
    *
    * setGuiToCtrlVScanMap
    *
    *    Set the list of VSCAN codes for which Gui+<VScan> is converted to
    *    Ctrl+<VScan>.
    *
    *---------------------------------------------------------------------------
    */

   this.setGuiToCtrlVScanMap = function(value) {
      this._guiToCtrlVScanMap = value;
   };


   /*
    *---------------------------------------------------------------------------
    *
    * setIgnoredRawKeyCodes
    *
    *    Does nothing for keyboardManager2.
    *
    *---------------------------------------------------------------------------
    */

   this.setIgnoredRawKeyCodes = function(value) {
   };


   this._onLedKeyChanged = function(vScanCode) {
      var maxPendingTime = 1000;
      if(this._ledPendingTimer[vScanCode]) {
         clearTimeout(this._ledPendingTimer[vScanCode]);
      }
      WMKS.LOGGER.trace("pause auto-status correction for " + vScanCode + " due to status in sync");
      this._ledInPending[vScanCode] = true;
      this._ledPendingTimer[vScanCode] = setTimeout(function() {
          WMKS.LOGGER.debug("modifier " + vScanCode + " sync timeout, enable auto-correction");
         this._ledInPending[vScanCode] = false;
         this._ledPendingTimer[vScanCode] = null;
      }.bind(this), maxPendingTime);
   };



   /**
    * See bug 2683076
    * Since it's very uncommon for user to press caps lock, number lock, scroll within 1s,
    * we simply resumes auto-status-correction for them here without checking whether each
    * key really get synced.
    */
   this._updatePendingStatusForLeds = function(leds) {
      var i, ledKey;
      var ledKeys = WMKS.CONST.KB2.LedKeys;
      for (i = 0; i < ledKeys.length; i++) {
         ledKey = ledKeys[i];
         if (ledKey && this._ledPendingTimer[ledKey]) {
            clearTimeout(this._ledPendingTimer[ledKey]);
         }
         this._ledInPending[ledKey] = false;
      }
      WMKS.LOGGER.trace("get LED status updated");
   };


   /*
    *---------------------------------------------------------------------------
    *
    * sendVScanKey
    *
    *    Utility function to send vScanCode to server.
    *
    *---------------------------------------------------------------------------
    */

   this.sendVScanKey = function(vScanCode, isDown) {
      this._vncDecoder.onKeyVScan(vScanCode, isDown);

      if (WMKS.CONST.KB2.ModifierKeys.indexOf(vScanCode) !== -1) {
         this._serverModifierStatus[vScanCode] = isDown;
      }

      if (WMKS.CONST.KB2.LedKeys.indexOf(vScanCode) !== -1) {
         if (isDown) {
            this._onLedKeyChanged(vScanCode);
         }
      }
   };


   /*
    *---------------------------------------------------------------------------
    *
    * onKeyboardLEDsChanged
    *
    *    Called when the remote server keyboard LEDs have changed, we will
    *    make a copy and check them in the next onKeyDown so we can synchronise
    *    between client and server.
    *
    *---------------------------------------------------------------------------
    */

   this.onKeyboardLEDsChanged = function(leds) {
      this._serverKeyboardLeds = leds;
      this._updatePendingStatusForLeds(leds);
   };


   /*
    *---------------------------------------------------------------------------
    *
    * cancelModifiers
    *
    *    Clear all modifiers currently in a 'keydown' state. Used as a cleanup
    *    for onBlur or to clear the modifier state upon close of the
    *    extendedKeypad widget.
    *
    *---------------------------------------------------------------------------
    */

   this.cancelModifiers = function(applyToSoftKB) {
      for (var vScanCode in this._serverModifierStatus) {
         if (this._serverModifierStatus[vScanCode]) {
            this.sendVScanKey(vScanCode, false);
         }
      }

      this._clientModifierStatus = {};
      this._serverModifierStatus = {};
   };


   /*
    *---------------------------------------------------------------------------
    *
    * clearState
    *
    *    Reset all the modifiers on the remote server.
    *
    *---------------------------------------------------------------------------
    */

   this.clearState = function() {
      this._clientModifierStatus = {};
      this._serverModifierStatus = {};

      for (var i = 0; i < WMKS.CONST.KB2.ModifierKeys.length; ++i) {
         this.sendVScanKey(WMKS.CONST.KB2.ModifierKeys[i], false);
      }
   };
};
