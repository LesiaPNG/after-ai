/* Copyright 2026 Ачкасова Олеся. SPDX-License-Identifier: GPL-3.0-only */
(function () {
  'use strict';
  var native = window.__adobe_cep__;
  window.AIFlowCEP = native ? {
    getExtensionPath: function () {
      var value = decodeURI(native.getSystemPath('extension'));
      return value.indexOf('file:///') === 0 ? value.slice(8) : value;
    },
    evalScript: function (script, callback) { native.evalScript(script, callback); }
  } : null;
}());
