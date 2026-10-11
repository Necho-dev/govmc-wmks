/**
 * translateService.js
 *
 * Since wmks should be a portable component, define it's own
 * translate service here.
 *
 * Could force to use specified language by l10N.setLocaleAndLoad
 */
WMKS.translateTable = {};
WMKS.l10N = {
   // Mapping of supported locales to the corresponding js file.
   supportedLocale: {
      "en": "en",
      "es": "es",
      "de": "de",
      "fr": "fr",
      "ja": "ja",
      "ko": "ko",
      "zh": "zh_CN",
      "en-us": "en",
      "es-es": "es",
      "de-de": "de",
      "fr-fr": "fr",
      "ja-jp": "ja",
      "ko-kr": "ko",
      "zh-cn": "zh_CN",
      "zh-hans": "zh_CN",
      "zh-hant": "zh_TW",
      "zh-tw": "zh_TW",
      "zh-hk": "en",
      "zh-mo": "en",
      "zh-hans-hk": "en",
      "zh-hant-hk": "en",
      "zh-hans-mo": "en",
      "zh-hant-mo": "en"
   },

   // Locale to be used during translation. Default is English.
   locale: 'en',

   // js object containing the translated text.
   translatedTable: null,

   // Get Locale info
   getLocale: function() {
      if (!this.translatedTable) {
         // Set locale and load JS translation table.
         this.setLocaleAndLoad();
      }

      return this.locale;
   },

   // Set the locale and load the corresponding JS translation table.
   setLocaleAndLoad: function(acceptLanguage) {
      var self = this,
         url,
         selectedLocale,
         data;

      if (!acceptLanguage) {
         // The language version of the platform
         acceptLanguage = navigator.language || navigator.userLanguage;
      }

      if (acceptLanguage) {
         // Determine the corresponding JS translation file.
         selectedLocale = this.getBestLocale(acceptLanguage);
         if (selectedLocale) {
            this.locale = selectedLocale;
         }
      }

      WMKS.LOGGER.debug('Load translation table for locale: ' + this.locale);
      if (WMKS.translateTable.hasOwnProperty(this.locale)) {
         // There is no need to load the English translation table.
         this.translatedTable = WMKS.translateTable[this.locale];
         return;
      } else if (WMKS.translateTable.hasOwnProperty('en')) {
         WMKS.LOGGER.info("en translate table loaded as fallback");
         this.locale = "en";
         this.translatedTable = WMKS.translateTable['en'];
      } else {
         WMKS.LOGGER.info("translate table not loaded correctly in webmks");
      }
   },

   translate: function(msgid, args) {
      var translatedStr,
      i;

      /**
       * If the translated msgid exists, return the translated string, else
       * return the original message key.
       */
      if (!!this.translatedTable && !!this.translatedTable[msgid] &&
         !!this.translatedTable[msgid].length > 0) {
         translatedStr = this.translatedTable[msgid];
      } else {
         WMKS.LOGGER.info("translate fall back to message key in webmks for " + msgid);
         translatedStr = msgid;
      }


      if (args && args.length > 0) {
         // Iterate & replace placeHolders matching number of input args.
         for (i = 0; i < args.length; i++) {
            translatedStr = translatedStr.split("{" + i + "}").join(args[i]);
         }
      }
      return translatedStr;
   },

   /**
    * For a given list of desired locales, determine which language out of
    * our supported languages we should display.
    */
   getBestLocale: function(acceptLanguage) {
      var matchedLocale = null,
         matchedRank = 0,
         accepted,
         i,
         kv,
         parts,
         thisRank,
         localeAndRank;

      if (!acceptLanguage) {
         return null;
      }

      /**
       * For each of the languages in the acceptLanguage param, see
       * if getSupportedLocale likes it. If so, set the currently
       * preferred language and its rank ('q=' value.) Do this for
       * all languages.
       */
      accepted = acceptLanguage.split(',');
      for (i = 0; i < accepted.length; i++) {
         if (accepted[i].indexOf('*') >= 0) {
            // Ignore the wildcard.
            continue;
         }

         /*
          * There may be a 'q=' section with a rank for this language.
          * Set rank value to 1 by default.
          */
         thisRank = 1;
         parts = $.trim(accepted[i]).split(';', 2);
         if (parts.length === 2) {
            kv = parts[1].split('=', 2);
            if (kv[0] === 'q' && kv.length === 2) {
               thisRank = parseFloat(kv[1]);
            }
         } else if (parts.length < 1) {
            continue;
         }

         /**
          * If this locale entry is supported, compare its rank to the
          * highest matched rank thus far.
          */
         localeAndRank = this.getSupportedLocale(parts[0], thisRank);
         if (localeAndRank) {
            if (localeAndRank[1] > matchedRank) {
               matchedLocale = localeAndRank[0];
               matchedRank = localeAndRank[1];
            }
         }
      }

      return matchedLocale;
   },

   /**
    * For a given locale, determine the best supported localization
    * fit for that language using the supportedLocale dictionary.
    */
   getSupportedLocale: function(locale, returnRank) {
      var langCode,
         selectedLocale,
         specifiers;

      // Convert to lower-case.
      locale = locale.toLowerCase();

      if (this.supportedLocale.hasOwnProperty(locale)) {
         // The full locale is specifically supported.
         selectedLocale = this.supportedLocale[locale];
      } else {
         specifiers = locale.split('-');
         if (specifiers.length > 2) {
            // Locale string like 'zh-hant' or 'zh-hant'.
            langCode = specifiers[0] + '-' + specifiers[1];
            if (this.supportedLocale.hasOwnProperty(langCode)) {
               // The language is zh-hans or zh-hant
               selectedLocale = this.supportedLocale[langCode];
            }
         }
         if (!selectedLocale && specifiers.length > 0) {
            // Locale string like 'en-us' or 'zh-tw'.
            langCode = specifiers[0];
            if (this.supportedLocale.hasOwnProperty(langCode)) {
               /**
                * The language is supported, but not in the desired locale,
                * the request is generic (xx instead of xx-YY)
                */
               selectedLocale = this.supportedLocale[langCode];
            }
         }
      }

      if (selectedLocale) {
         return [selectedLocale, returnRank];
      }

      return null;
   }
};

/**
 * Get the translated strings for a key with parameters
 */
WMKS._ = function(msgid) {
   var args = [],
      i;

   // Skip the first parameter for it is the key.
   for (i = 1; i < arguments.length; i++) {
      args.push(arguments[i]);
   };
   /**
    * Load the resources when the _ function first called.
    */
   if (!WMKS.l10N.translatedTable) {
      // Load translation table according to the desired locale.
      WMKS.l10N.setLocaleAndLoad();
   }

   return WMKS.l10N.translate(msgid, args);
}