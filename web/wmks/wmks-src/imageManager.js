
/*
 *------------------------------------------------------------------------------
 * wmks/ImageManagerWMKS.js
 *
 *    This class abstracts Image caching solution in an optimal way. It takes
 *    care of returning the image in a clean, and memory leak proof manner.
 *    It exposes 2 functions  to get and release images. The get function
 *    returns an Image object either from an unused cache or by creating a new one.
 *    The return function, depending on the max allowed cache size decides to
 *    either add the image to the cache or get rid of it completely.
 *
 *------------------------------------------------------------------------------
 */

function ImageManagerWMKS(imageCacheSize) {
  'use strict';
   var _cacheSize = imageCacheSize;  // Max number of images cached.
   var _cacheArray = [];             // Cache to hold images.

   /*
    *---------------------------------------------------------------------------
    *
    * _getImage
    *
    *    Pushes the current image to the cache if it is not full,
    *    and then deletes the image.
    *
    *---------------------------------------------------------------------------
    */

   var _getImageFromCache = function() {
      if (_cacheArray.length > 0) {
         return _cacheArray.shift();
      } else {
         return new Image();
      }
   };

   /*
    *---------------------------------------------------------------------------
    *
    * _cacheImageOrDelete
    *
    *    Private function that resets event handlers if any. Sets src to an
    *    empty image. Pushes the current image to the cache if it is not full,
    *    else deletes the image.
    *
    *---------------------------------------------------------------------------
    */

   var _cacheImageOrDelete = function(image) {
      // Reset onload and onerror event handlers if any.
      image.onload = image.onerror = null;

      /*
       * Issues with webkit image caching:
       * 1. Setting image.src to null is insufficient to turn off image caching
       *    in chrome (webkit).
       * 2. An empty string alone is not sufficient since browsers may treat
       *    that as meaning the src is the current page (HTML!) which will
       *    lead to a warning on the browsers javascript console.
       * 3. If we set it to an actual string with an empty data URL, this helps
       *    the first time, however when we try to decode the same image again
       *    and again later on, the onload will not be called and we have a
       *    problem.
       * 4. If we set it to a data:image with invalid data some browsers
       *    (such as IE11 or Edge) will spam the log with error messages.
       * 5. So finally, we use the smallest valid 1x1 black gif and append a
       *    timestamp to the data URL so that the browser treats it as a new
       *    image every time. This keeps image cache consistent.
       */
      var tinyGif = [ 0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
                      0x01, 0x00, 0x00, 0xFF, 0x00, 0x2C, 0x00, 0x00,
                      0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02,
                      0x00, 0x3B ];
      tinyGif.push32($.now());
      image.src = "data:image/gif;base64," + Base64.encodeFromArray(tinyGif);

      if (_cacheArray.length <= _cacheSize) {
         _cacheArray.push(image);
      } else {
         // Image deleting in strict mode causes error. Hence the roundabout way.
          WMKS.UTIL.deleteImage([image]);
      }
   };

   /*
    *---------------------------------------------------------------------------
    *
    * getImage
    *
    *    Public function that invokes a private function _getImageFromCache()
    *    to get an image.
    *
    *---------------------------------------------------------------------------
    */
   this.getImage = function() {
      return _getImageFromCache();
   };

   /*
    *---------------------------------------------------------------------------
    *
    * releaseImage
    *
    *    Public function that invokes a private function _cacheImageOrDelete()
    *    to add the image to a cache when the cache is not full or delete the
    *    image.
    *
    *---------------------------------------------------------------------------
    */
   this.releaseImage = function(image) {
      if (!image) {
         return;
      }
      _cacheImageOrDelete(image);
   };
};
