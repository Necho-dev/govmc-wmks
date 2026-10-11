/* global $:false, WMKS:false */

/*
 *------------------------------------------------------------------------------
 * wmks/relativeMouseHandler.js
 *
 *    This class abstracts relative mouse management and decouples this
 *    functionality from the widgetProto.
 *
 *    All variables are defined as private variables. Functions that do not
 *    need to be exposed should be private too.
 *
 *------------------------------------------------------------------------------
 */

WMKS.RelativeMouseHandler = function(options) {
   'use strict';
   if (!options || !options.canvas ||
       !options.widgetProto) {
      WMKS.LOGGER.warn('Invalid params set for RelativeMouseHandler.');
      return null;
   }

   var _widget = options.widgetProto,
       _canvas = options.canvas,     // Canvas where all the action happens.
       _onToggle = options.onToggle; // Toggle callback function.

   // List of jQuery objects that are used frequently.
   var _ELEMENTS = {
         inputProxy        : null,
         cursorIcon        : null,
         clickFeedback     : null,
         dragFeedback      : null,
         pulseFeedback     : null,
         scrollFeedback    : null,
         keypad            : null,
         relativePad       : null
       };

   /****************************************************************************
    * Public Functions
    ***************************************************************************/
   /*
    *---------------------------------------------------------------------------
    *
    * toggleTrackpad
    *
    *    Called when the user wants to toggle trackpad visibility.
    *
    *---------------------------------------------------------------------------
    */

   this.toggleRelativePad = function(options) {
      if (_ELEMENTS.relativePad) {
         // Set toggle callback function.
         options = $.extend({}, options, {
            toggleCallback: _onToggle
         });
         // Show / hide trackpad.
         _ELEMENTS.relativePad.toggle(options);
      }
   };


   /*
    *---------------------------------------------------------------------------
    *
    * installTouchHandlers
    *
    *    Install event handlers for touch devices.
    *
    *---------------------------------------------------------------------------
    */

   this.installMouseHandlers = function() {
      var self = this,
          container = _canvas.parent();

      // Set css values to disable unwanted default browser behavior.
      _canvas.css({
         '-webkit-user-select':     'none',  /* disable cut-copy-paste */
         '-webkit-touch-callout':   'none'   /* disable callout, image save panel */
      });

      // Create touch feedbacks.
      _ELEMENTS.cursorIcon = $('<div/>')
         .addClass('feedback-container cursor-icon')
         .appendTo(container);
      _ELEMENTS.clickFeedback = $('<div/>')
         .addClass('feedback-container tap-icon')
         .appendTo(container);
      _ELEMENTS.dragFeedback = $('<div/>')
         .addClass('feedback-container drag-icon')
         .appendTo(container);
      _ELEMENTS.pulseFeedback = $('<div/>')
         .addClass('feedback-container pulse-icon')
         .appendTo(container);
      _ELEMENTS.scrollFeedback = $('<div/>')
         .addClass('feedback-container scroll-icon')
         .appendTo(container);
   };

   /*
    *---------------------------------------------------------------------------
    *
    * initializeRelativeMouseFeature
    *
    *    This function initializes the touch feature that's requested.
    *
    *---------------------------------------------------------------------------
    */

   this.initializeRelativeMouseFeature = function() {
      _ELEMENTS.relativePad = new WMKS.relativePadManager(_widget, _canvas);
      _ELEMENTS.relativePad.initialize();
   };

      /*
    *---------------------------------------------------------------------------
    *
    * moveCursor
    *
    *    Repositions the fake caret to match the given touch's location. Since
    *    the 'tip' of the caret represents the click location, no centering is
    *    desired.
    *
    *---------------------------------------------------------------------------
    */

   this.moveCursor = function(pageX, pageY) {
      if (_ELEMENTS.cursorIcon) {
         _ELEMENTS.cursorIcon.css({'left': pageX, 'top': pageY});
      }
   };


   /*
    *---------------------------------------------------------------------------
    *
    * setCursorVisibility
    *
    *    Hide or show the fake caret.
    *
    *---------------------------------------------------------------------------
    */

   this.setCursorVisibility = function(visible) {
      if (_ELEMENTS.cursorIcon) {
         if (visible) {
            _ELEMENTS.cursorIcon.show();
         } else {
            _ELEMENTS.cursorIcon.hide();
         }
      }
   };
   /*
    *---------------------------------------------------------------------------
    *
    * destroy
    *
    *    Destroys the TouchHandler.
    *
    *    This will disconnect all (if active) and remove
    *    the widget from the associated element.
    *
    *    Consumers should call this before removing the element from the DOM.
    *
    *---------------------------------------------------------------------------
    */

   this.destroy = function() {
      // Cleanup private variables.
      _widget = null;
      _canvas = null;
      _ELEMENTS = null;
   };

};