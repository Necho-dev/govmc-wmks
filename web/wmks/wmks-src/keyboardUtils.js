
/*
 * wmks/keyboardUtils.js
 *
 *   WebMKS keyboard event decoder and key remapper.
 *
 */

WMKS.keyboardUtils = {};



WMKS.keyboardUtils._keyInfoTemplate = {
   jsScanCode: 0,
   vScanCode: 0,
};



/*
 *------------------------------------------------------------------------------
 *
 * keyDownUpInfo
 *
 *    Parses a keydown/keyup event.
 *
 * Results:
 *    { jsScanCode,  The JavaScript-reposted scancode, if any. Arbitrary.
 *      vScanCode }  The VMX VScancode for the key on a US keyboard, if any.
 *
 * Side Effects:
 *    None.
 *
 *------------------------------------------------------------------------------
 */

WMKS.keyboardUtils.keyDownUpInfo = function(event) {
   var evt = event || window.event;
   var ki = this._keyInfoTemplate;

   if (evt.type === 'keydown' || evt.type === 'keyup') {
      /*
       * Convert JS scancode to VMware VScancode
       */
      ki.jsScanCode = evt.keyCode;
      ki.vScanCode = this._jsToVScanTable[ki.jsScanCode];

      /*
       * Workaround ie9/ie10 enter key behaviour.  We receive
       * keydown/keyup events but no keypress events for the enter
       * key.  On the other hand Firefox and Chrome give us
       * keydown/keyup *plus* keypress events for this key.  Short of
       * using a timer, don't see a way to catch both cases without
       * introducing a browser dependency here.
       */
      if (WMKS.BROWSER.isIE() && WMKS.BROWSER.version.major <= 10 && ki.jsScanCode == 13) {
         ki.vScanCode = 28;
      }
   }

   return ki;
};


/*
 *------------------------------------------------------------------------------
 *
 * keyPressInfo
 *
 *    Parses a keypress event.
 *
 * Results:
 *    The Unicode character generated during the event, or 0 if none.
 *
 * Side Effects:
 *    None.
 *
 *------------------------------------------------------------------------------
 */

WMKS.keyboardUtils.keyPressInfo = function(event) {
   var evt = event || window.event;
   var uChar = 0;

   if (evt.type === 'keypress') {
      uChar = evt.which;

      /*
       * Handle Backspace, Tab, ESC via keyDown instead.
       */
      if (uChar == 8 || uChar == 9 || uChar == 27) {
         uChar = 0;
      }
   }

   return uChar;
};





/*
 * JS scancode to VMware VScancode conversion table
 */
WMKS.keyboardUtils._jsToVScanTable = {
   // Space, enter, tab, escape, backspace
   //32 : 0x039,
   //13 : 0x01c,
   9 : 0x00f,
   27 : 0x001,
   8 : 0x00e,

   // shift, control, alt, Caps Lock, Num Lock
   16 : 0x02a,     // left shift
   17 : 0x01d,     // left control
   18 : 0x038,     // left alt
   20 : 0x03a,
   240 : 0x03a,    // windows 8.1 caps lock
   144 : 0x045,

   // Arrow keys (left, up, right, down)
   37 : 0x14b,
   38 : 0x148,
   39 : 0x14d,
   40 : 0x150,

   // Special keys (Insert, delete, home, end, page up, page down, F1 - F12)
   45 : 0x152,
   46 : 0x153,
   36 : 0x147,
   35 : 0x14f,
   33 : 0x149,
   34 : 0x151,
   112 : 0x03b,
   113 : 0x03c,
   114 : 0x03d,
   115 : 0x03e,
   116 : 0x03f,
   117 : 0x040,
   118 : 0x041,
   119 : 0x042,
   120 : 0x043,
   121 : 0x044,
   122 : 0x057,
   123 : 0x058,

   // Special Keys (Left Apple/Command, Right Apple/Command, Left Windows, Right Windows, Menu)
   224 : 0x038,
   // ? : 0x138,
   91 : 0x15b,
   92 : 0x15c,
   93 : 0, //?

   42 : 0x054,  // PrintScreen / SysRq
   19 : 0x100  // Pause / Break

   /*
    * Commented out since these are locking modifiers that easily get
    * out of sync between server and client and thus cause unexpected
    * behaviour.
    */
   //144 : 0x045,  // NumLock
   //20 : 0x03a,  // CapsLock
   //145 : 0x046,  // Scroll Lock

};
WMKS.keyboardUtils._jsToVScanTables = {
   'de-DE' : {
      //German dead keys
      220: 0x029, //^
      221: 0x00d,  //´
      192: 13,
      192: 41, // ^ mac chrome
      187: 13, // ´ mac chrome
      96: 13 // ´ windows firefox
   },
   'es-ES' : {
      //Spanish dead keys
      94: 26,  //^
      96: 26, //`
      180: 40, //´
      168: 40, //
      192: 26,
      219: 26,
      222: 40,
      186: 26,
      242: 26
   },
   'it-IT' : {
      5: 18, //€
      30: 26,
      29: 27,
      64: 39, //ò
      35: 40, //à  bug 1710907
      91: 26, //è bug
      93: 27, //+ bug
      171: 27,
      109: 39,
      186: 39,
      123: 26, //é bug
      125: 27, //*
      8364: 18, //E
   }
};
WMKS.keyboardUtils._charToKeycode = {
   'de-DE' : {
      'ü': 252,
      'Ü': 252,
      'ö': 246,
      'Ö': 246,
      'ä': 228,
      'Ä': 228
   },
   'es-ES' : {
      '[': 192,
      ']': 43,
      '{': 222,
      '}': 231,
      '0': 186,
      '"': 1034,
      'º': 186,
      'ª': 186,
      'ç': 231,
      'Ç': 231,
      'Ñ': 209,
      'ñ': 209,
      '¡': 261,
      '¿': 161
   },
   'it-IT' : {
      '[': 30,
      '{': 30,
      ']': 29,
      '}': 29,
      '@': 1109,
      '%': 1037,
      'à': 1224,
      '°': 1224,
      'è': 232,
      'é': 232,
      'ì': 94,
      '^': 94,
      'ò': 242,
      'ç': 242,
      'ù': 249,
      '§': 249
   },
   'pt-BR' : {
      'ç': 231,
      'Ç': 231
      // '§': 167,
      // 'º': 186,
      // 'ª': 186
   },
   'pt-PT' : {
      'ç': 231,
      'Ç': 231,
      'º': 186,
      'ª': 186,
      '°': 43,
      '«': 187,
      '»': 187,
      'À': 333
   },
   'fr-FR' : {
      '²': 178
   },
   'fr-CH' : {
      '§': 167,
      '°': 176,
      'è': 232,
      'ü': 252,
      'é': 233,
      'ö': 246,
      'à': 1224,
      'ä': 228,
      '[': 232,
      '{': 224,
      '"': 1224
   },
   'de-CH' : {
      '§': 167,
      '°': 176,
      'è': 232,
      'ü': 252,
      'é': 233,
      'ö': 246,
      'à': 1224,
      'ä': 228,
      '[': 232,
      '{': 224,
      '"': 1224,
      'Ä': 228,
      'Ö': 246,
      'Ü': 252,
      'À': 1224,
      'È': 232,
      'É': 233
   }
};
WMKS.keyboardUtils._remapUncontrolKeys = {
   'de-DE' : {
      17: 81,
      13: 77
   },
   'es-ES' : {
      27: 219
   },
   'it-IT' : {
      13: 186
   },
   'pt-PT' : {
      27: 168
   },
   'fr-FR' : {
      27: 93
   },
   'fr-CH' : {
      27: 232
   },
  'de-CH' : {
      27: 232
   }

};
WMKS.keyboardUtils._keypressUnusefulKeys = {
   'de-DE' : [180,94,96],
   'es-ES' : [180,96]
};

WMKS.keyboardUtils._SmallKeyboardKey = {
   'de-DE' : [47,42,61],
   'it-IT' : [47,42,61],
   'es-ES' : [47,42,61],
   'ja-JP_106/109': [42,43],
   'en-US': [42,43],
   'pt-BR': [42],
   'pt-PT': [42,47],
   'fr-FR': [43,46,47,48,49,50,51,52,53,54,55,56,57],
   'fr-CH': [42,43,47],
   'de-CH': [42,43,47]
};
WMKS.keyboardUtils._smallKeyboardPendingKey = {
   'de-DE' : {
      47: 55,
      61: 48
   },
   'fr-FR': {
      43: [187, 61], // windows chrome, win ff +
      46: [190, 59], // windows chrome .
      47: [191, 58], // windows chrome /
      48: 48,
      49: 49,
      50: 50,
      51: 51,
      52: 52,
      53: 53,
      54: 54,
      55: 55,
      56: 56,
      57: 57
   }
};

/*
 * it-IT :# @ [ ] { } €
 * fr-fr :# @ [ \ ] ^ ` { | } ~ ¤ €
 * fr-CH :    #   @   [   \   ]   {   |     }    ~    ¢    ¦   ¬     `    €
 */

WMKS.keyboardUtils._WindowsFirefoxAltGr = {
   'pt-PT': [64, 91, 93, 123, 125, 163, 167, 168, 178, 8364],
   'de-DE': [64, 91, 92, 93, 123, 124, 125, 126, 172, 178, 179, 181, 8364],
   'it-IT': [35, 64, 91, 93, 123, 125, 8364],
   'es-ES': [35, 64, 91, 92, 93, 123, 124, 125, 126, 172, 178, 179, 181, 8364],
   'fr-FR': [35, 64, 91, 92, 93, 94, 96, 123, 124, 125, 126, 164, 8364],
   'fr-CH': [35, 64, 91, 92, 93, 123, 124, 125, 126, 162, 166, 172, 167, 176, 219, 8364],
   'de-CH': [35, 64, 91, 92, 93, 123, 124, 125, 126, 162, 166, 172, 167, 176, 8364]
};

WMKS.keyboardUtils._remapPending = {
   'fr-CH' : {
      224: 65, // â
      232: 69, // è
      233: 69, // é
      228: 65, // ä
      246: 79, // ö
      252: 85, // ü
      192: 65, // À
      219: 85, // û
      241: 78, // N
      209: 78, // n
      176: 52, // °
      167: 53 // §
   },
   'fr-FR' : {
      224: 65, // à
      232: 69, // è
      236: 73, // ì
      242: 79, // ò
      249: 85, // ù
      241: 78 // ~n
   },
   'de-CH' : {
      //German dead keys
      224: 65, // â
      232: 69, // è
      233: 69, // é
      228: 65, // ä
      246: 79, // ö
      252: 85, // ü
      192: 65, // À
      241: 78, // N
      209: 78, // n
      176: 52, // °
      167: 53, // §
      196: 65, // Ä
      214: 79, // Ö
      220: 85, // Ü
      200: 69, // È
      192: 65, // À
      201: 69, // é
      219: 85  // û
   },
   'de-DE' : {
      193: 65, // Á
      201: 69, // É
      205: 73, // Í
      211: 79, // Ó
      218: 85, // Ú
      194: 65, // Â
      202: 69, // Ê
      206: 73, // Î
      212: 79, // Ô
      219: 85  // Û
   },
   'ja-JP_106/109' : {
      92: 226 // \ windows firefox \ and top right key value are the same
   },
   'es-ES' : {
      193: 65, // Á
      201: 69, // É
      205: 73, // Í
      211: 79, // Ó
      218: 85, // Ú
      192: 65, // À
      200: 69, // È
      204: 73, // Ì
      210: 79, // Ò
      217: 85, // Ù
      241: 78 // ~n
   }
};
WMKS.keyboardUtils._remapFrChAltgrKey = {
   91:180, //up accent
   93:94, //~
   59:91, // [
   94:93,  //]
   92:123, //{
   0:125 //}
};

WMKS.keyboardUtils.fromKeyCodeToVScanCode = {
   'ControlLeft':          WMKS.VSCAN_CODES.VSCAN_LCONTROL,
   'ControlRight':         WMKS.VSCAN_CODES.VSCAN_RCONTROL,
   'ShiftLeft':            WMKS.VSCAN_CODES.VSCAN_LSHIFT,
   'ShiftRight':           WMKS.VSCAN_CODES.VSCAN_RSHIFT,
   'AltLeft':              WMKS.VSCAN_CODES.VSCAN_LALT,
   'AltRight':             WMKS.VSCAN_CODES.VSCAN_RALT,
   'MetaLeft':             WMKS.VSCAN_CODES.VSCAN_LGUI,
   'MetaRight':            WMKS.VSCAN_CODES.VSCAN_RGUI,
   'OSLeft':               WMKS.VSCAN_CODES.VSCAN_LGUI,
   'OSRight':              WMKS.VSCAN_CODES.VSCAN_RGUI,

   'Home':                 WMKS.VSCAN_CODES.VSCAN_HOME,
   'ArrowUp':              WMKS.VSCAN_CODES.VSCAN_UP,
   'PageUp':               WMKS.VSCAN_CODES.VSCAN_PAGEUP,
   'ArrowLeft':            WMKS.VSCAN_CODES.VSCAN_LEFT,
   'ArrowRight':           WMKS.VSCAN_CODES.VSCAN_RIGHT,
   'End':                  WMKS.VSCAN_CODES.VSCAN_END,
   'ArrowDown':            WMKS.VSCAN_CODES.VSCAN_DOWN,
   'PageDown':             WMKS.VSCAN_CODES.VSCAN_PAGEDOWN,
   'Insert':               WMKS.VSCAN_CODES.VSCAN_INSERT,
   'Delete':               WMKS.VSCAN_CODES.VSCAN_DELETE,

   'NumpadDivide':         WMKS.VSCAN_CODES.VSCAN_NUMPAD_DIVIDE,
   'NumpadMultiply':       WMKS.VSCAN_CODES.VSCAN_NUMPAD_MULTIPLY,
   'Numpad7':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_7,
   'Numpad8':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_8,
   'Numpad9':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_9,
   'NumpadSubtract':       WMKS.VSCAN_CODES.VSCAN_NUMPAD_MINUS,
   'Numpad4':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_4,
   'Numpad5':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_5,
   'Numpad6':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_6,
   'NumpadAdd':            WMKS.VSCAN_CODES.VSCAN_NUMPAD_PLUS,
   'Numpad1':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_1,
   'Numpad2':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_2,
   'Numpad3':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_3,
   'Numpad0':              WMKS.VSCAN_CODES.VSCAN_NUMPAD_0,
   'NumpadDecimal':        WMKS.VSCAN_CODES.VSCAN_NUMPAD_DOT,
   'NumpadComma':          WMKS.VSCAN_CODES.VSCAN_NUMPAD_COMMA,
   'NumpadEnter':          WMKS.VSCAN_CODES.VSCAN_NUMPAD_ENTER,
   'NumpadEqual':          WMKS.VSCAN_CODES.VSCAN_EQUALS,
   'NumpadClear':          WMKS.VSCAN_CODES.VSCAN_NUMLOCK,

   'ScrollLock':           WMKS.VSCAN_CODES.VSCAN_SCROLL,
   'PrintScreen':          WMKS.VSCAN_CODES.VSCAN_PRINT,
   'Pause':                WMKS.VSCAN_CODES.VSCAN_PAUSE,
   'Backspace':            WMKS.VSCAN_CODES.VSCAN_BACKSPACE,
   'NumLock':              WMKS.VSCAN_CODES.VSCAN_NUMLOCK,
   // No browser support for VSCAN_SYSREQ

   'Tab':                  WMKS.VSCAN_CODES.VSCAN_TAB,
   'Escape':               WMKS.VSCAN_CODES.VSCAN_ESCAPE,
   'Enter':                WMKS.VSCAN_CODES.VSCAN_ENTER,
   'Space':                WMKS.VSCAN_CODES.VSCAN_SPACE,
   'CapsLock':             WMKS.VSCAN_CODES.VSCAN_CAPSLOCK,
   'F1':                   WMKS.VSCAN_CODES.VSCAN_F1,
   'F2':                   WMKS.VSCAN_CODES.VSCAN_F2,
   'F3':                   WMKS.VSCAN_CODES.VSCAN_F3,
   'F4':                   WMKS.VSCAN_CODES.VSCAN_F4,
   'F5':                   WMKS.VSCAN_CODES.VSCAN_F5,
   'F6':                   WMKS.VSCAN_CODES.VSCAN_F6,
   'F7':                   WMKS.VSCAN_CODES.VSCAN_F7,
   'F8':                   WMKS.VSCAN_CODES.VSCAN_F8,
   'F9':                   WMKS.VSCAN_CODES.VSCAN_F9,
   'F10':                  WMKS.VSCAN_CODES.VSCAN_F10,
   'F11':                  WMKS.VSCAN_CODES.VSCAN_F11,
   'F12':                  WMKS.VSCAN_CODES.VSCAN_F12,
   'F13':                  WMKS.VSCAN_CODES.VSCAN_F13,
   'F14':                  WMKS.VSCAN_CODES.VSCAN_F14,
   'F15':                  WMKS.VSCAN_CODES.VSCAN_F15,
   'F16':                  WMKS.VSCAN_CODES.VSCAN_F16,
   'F17':                  WMKS.VSCAN_CODES.VSCAN_F17,
   'F18':                  WMKS.VSCAN_CODES.VSCAN_F18,
   'F19':                  WMKS.VSCAN_CODES.VSCAN_F19,
   'F20':                  WMKS.VSCAN_CODES.VSCAN_F20,
   'F21':                  WMKS.VSCAN_CODES.VSCAN_F21,
   'F22':                  WMKS.VSCAN_CODES.VSCAN_F22,
   'F23':                  WMKS.VSCAN_CODES.VSCAN_F23,
   'F24':                  WMKS.VSCAN_CODES.VSCAN_F24,

   'KeyA':                 WMKS.VSCAN_CODES.VSCAN_A,
   'KeyB':                 WMKS.VSCAN_CODES.VSCAN_B,
   'KeyC':                 WMKS.VSCAN_CODES.VSCAN_C,
   'KeyD':                 WMKS.VSCAN_CODES.VSCAN_D,
   'KeyE':                 WMKS.VSCAN_CODES.VSCAN_E,
   'KeyF':                 WMKS.VSCAN_CODES.VSCAN_F,
   'KeyG':                 WMKS.VSCAN_CODES.VSCAN_G,
   'KeyH':                 WMKS.VSCAN_CODES.VSCAN_H,
   'KeyI':                 WMKS.VSCAN_CODES.VSCAN_I,
   'KeyJ':                 WMKS.VSCAN_CODES.VSCAN_J,
   'KeyK':                 WMKS.VSCAN_CODES.VSCAN_K,
   'KeyL':                 WMKS.VSCAN_CODES.VSCAN_L,
   'KeyM':                 WMKS.VSCAN_CODES.VSCAN_M,
   'KeyN':                 WMKS.VSCAN_CODES.VSCAN_N,
   'KeyO':                 WMKS.VSCAN_CODES.VSCAN_O,
   'KeyP':                 WMKS.VSCAN_CODES.VSCAN_P,
   'KeyQ':                 WMKS.VSCAN_CODES.VSCAN_Q,
   'KeyR':                 WMKS.VSCAN_CODES.VSCAN_R,
   'KeyS':                 WMKS.VSCAN_CODES.VSCAN_S,
   'KeyT':                 WMKS.VSCAN_CODES.VSCAN_T,
   'KeyU':                 WMKS.VSCAN_CODES.VSCAN_U,
   'KeyV':                 WMKS.VSCAN_CODES.VSCAN_V,
   'KeyW':                 WMKS.VSCAN_CODES.VSCAN_W,
   'KeyX':                 WMKS.VSCAN_CODES.VSCAN_X,
   'KeyY':                 WMKS.VSCAN_CODES.VSCAN_Y,
   'KeyZ':                 WMKS.VSCAN_CODES.VSCAN_Z,
   'Backquote':            WMKS.VSCAN_CODES.VSCAN_TILDE,

   'Digit0':               WMKS.VSCAN_CODES.VSCAN_0,
   'Digit9':               WMKS.VSCAN_CODES.VSCAN_9,
   'Digit8':               WMKS.VSCAN_CODES.VSCAN_8,
   'Digit7':               WMKS.VSCAN_CODES.VSCAN_7,
   'Digit6':               WMKS.VSCAN_CODES.VSCAN_6,
   'Digit5':               WMKS.VSCAN_CODES.VSCAN_5,
   'Digit4':               WMKS.VSCAN_CODES.VSCAN_4,
   'Digit3':               WMKS.VSCAN_CODES.VSCAN_3,
   'Digit2':               WMKS.VSCAN_CODES.VSCAN_2,
   'Digit1':               WMKS.VSCAN_CODES.VSCAN_1,

   'Equal':                WMKS.VSCAN_CODES.VSCAN_EQUALS,
   'Minus':                WMKS.VSCAN_CODES.VSCAN_MINUS,

   'Slash':                WMKS.VSCAN_CODES.VSCAN_FWDSLASH,
   'BracketLeft':          WMKS.VSCAN_CODES.VSCAN_LBRACKET,
   'BracketRight':         WMKS.VSCAN_CODES.VSCAN_RBRACKET,
   'Backslash':            WMKS.VSCAN_CODES.VSCAN_BACKSLASH,
   'Semicolon':            WMKS.VSCAN_CODES.VSCAN_COLON,
   'Quote':                WMKS.VSCAN_CODES.VSCAN_QUOTE,
   'Comma':                WMKS.VSCAN_CODES.VSCAN_COMMA,
   'Period':               WMKS.VSCAN_CODES.VSCAN_PERIOD,

   'IntlBackslash':        WMKS.VSCAN_CODES.VSCAN_EUROPE2,
   'ContextMenu':          WMKS.VSCAN_CODES.VSCAN_MENU,
   'KanaMode':             WMKS.VSCAN_CODES.VSCAN_HIRAGANA,
   'IntlRo':               WMKS.VSCAN_CODES.VSCAN_RO,
   'IntlYen':              WMKS.VSCAN_CODES.VSCAN_YEN,
   'Convert':              WMKS.VSCAN_CODES.VSCAN_HENKAN,
   'NonConvert':           WMKS.VSCAN_CODES.VSCAN_MUHENKAN,

   'Power':                WMKS.VSCAN_CODES.VSCAN_POWER,

   'Lang1':                WMKS.VSCAN_CODES.VSCAN_HANGUL_EN,
   'Lang2':                WMKS.VSCAN_CODES.VSCAN_HANJA_EN,

   'MediaTrackPrevious':   WMKS.VSCAN_CODES.VSCAN_SCAN_PREVIOUS_TRACK,
   'MediaTrackNext':       WMKS.VSCAN_CODES.VSCAN_SCAN_NEXT_TRACK,
   'VolumeMute':           WMKS.VSCAN_CODES.VSCAN_MUTE,
   'AudioVolumeMute':      WMKS.VSCAN_CODES.VSCAN_MUTE,
   'LaunchApp2':           WMKS.VSCAN_CODES.VSCAN_CALCULATOR,
   'MediaPlayPause':       WMKS.VSCAN_CODES.VSCAN_PLAY_PAUSE,
   'MediaStop':            WMKS.VSCAN_CODES.VSCAN_STOP,
   'VolumeDown':           WMKS.VSCAN_CODES.VSCAN_VOLUME_DOWN,
   'VolumeUp':             WMKS.VSCAN_CODES.VSCAN_VOLUME_UP,
   'AudioVolumeDown':      WMKS.VSCAN_CODES.VSCAN_VOLUME_DOWN,
   'AudioVolumeUp':        WMKS.VSCAN_CODES.VSCAN_VOLUME_UP,
   'BrowserHome':          WMKS.VSCAN_CODES.VSCAN_BROWSER_HOME,
   'BrowserSearch':        WMKS.VSCAN_CODES.VSCAN_BROWSER_SEARCH,
   'BrowserFavorites':     WMKS.VSCAN_CODES.VSCAN_BROWSER_FAVORITES,
   'BrowserRefresh':       WMKS.VSCAN_CODES.VSCAN_BROWSER_REFRESH,
   'BrowserStop':          WMKS.VSCAN_CODES.VSCAN_BROWSER_STOP,
   'BrowserForward':       WMKS.VSCAN_CODES.VSCAN_BROWSER_FORWARD,
   'BrowserBack':          WMKS.VSCAN_CODES.VSCAN_BROWSER_BACK,
   'LaunchApp1':           WMKS.VSCAN_CODES.VSCAN_MY_COMPUTER,
   'LaunchMail':           WMKS.VSCAN_CODES.VSCAN_MAIL,
   'MediaSelect':          WMKS.VSCAN_CODES.VSCAN_MEDIA_SELECT,
};
