// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
"use strict";

CodeMirror.defineSimpleMode = function(name, states) {
  CodeMirror.defineMode(name, function(config) {
    return CodeMirror.simpleMode(config, states);
  });
};

CodeMirror.simpleMode = function(config, states) {
  ensureState(states, "start");
  var states_ = {}, meta = states.meta || {}, hasIndentation = false;
  for (var state in states) if (state != "meta" && states.hasOwnProperty(state)) {
    var list = states_[state] = [], orig = states[state];
    for (var i = 0; i < orig.length; i++) {
      var rule = orig[i];
      if (rule.next || rule.push) hasIndentation = true;
      list.push(new Rule(rule, states));
    }
  }
  var mode = {
    startState: function() {
      return {state: "start", pending: null,
              local: null, localState: null,
              indent: hasIndentation ? [] : null};
    },
    copyState: function(state) {
      var s = {state: state.state, pending: state.pending,
               local: state.local, localState: null,
               indent: state.indent && state.indent.slice(0)};
      if (state.localState)
        s.localState = CodeMirror.copyState(state.local.mode, state.localState);
      if (state.stack)
        s.stack = state.stack.slice(0);
      for (var pers = state.persistentStates; pers; pers = pers.next)
        s.persistentStates = {mode: pers.mode,
                              spec: pers.spec,
                              state: pers.state == state.localState ? s.localState : CodeMirror.copyState(pers.mode, pers.state),
                              next: s.persistentStates};
      return s;
    },
    token: function(stream, state) {
      if (state.pending) {
        var pend = state.pending.shift();
        if (state.pending.length == 0) state.pending = null;
        stream.pos += pend.text.length;
        return pend.token;
      }
      if (state.local) {
        if (state.local.end && stream.match(state.local.end)) {
          var tok = state.local.endToken || null;
          state.local = state.localState = null;
          return tok;
        } else {
          var tok = state.local.mode.token(stream, state.localState), m;
          if (state.local.endScan && (m = state.local.endScan.exec(stream.current())))
            stream.pos -= stream.current().length - m.index;
          return tok;
        }
      }
      var curState = states_[state.state];
      for (var i = 0; i < curState.length; i++) {
        var rule = curState[i];
        var matches = (!rule.data.sol || stream.sol()) && stream.match(rule.regexp);
        if (matches) {
          if (rule.data.next) {
            state.state = rule.data.next;
          } else if (rule.data.push) {
            (state.stack || (state.stack = [])).push(state.state);
            state.state = rule.data.push;
          } else if (rule.data.pop && state.stack && state.stack.length) {
            state.state = state.stack.pop();
          }
          if (rule.data.mode)
            enterLocalMode(config, state, rule.data.mode, rule.token);
          if (rule.data.indent)
            state.indent.push(stream.indentation() + config.indentUnit);
          if (rule.data.dedent)
            state.indent.pop();
          var token = rule.token;
          if (token && token.apply) token = token(matches);
          if (matches.length > 2 && rule.token && typeof rule.token != "string") {
            state.pending = [];
            for (var j = 2; j < matches.length; j++)
              if (matches[j]) state.pending.push({text: matches[j], token: rule.token[j - 1]});
            stream.backUp(matches[0].length - (matches[1] ? matches[1].length : 0));
            return rule.token[0];
          }
          return token;
        }
      }
      stream.next();
      return null;
    },
    indent: meta.indent ? function(state, textAfter, line) {
      if (state.local && state.local.mode.indent)
        return state.local.mode.indent(state.localState, textAfter, line);
      if (state.indent == null || state.local) return CodeMirror.Pass;
      var indented = state.indent.length ? state.indent[state.indent.length - 1] : 0;
      var over = meta.electricInput && meta.electricInput.test(textAfter);
      return over ? indented - config.indentUnit : indented;
    } : CodeMirror.Pass,
    electricInput: meta.electricInput,
    lineComment: meta.lineComment,
    blockCommentStart: meta.blockCommentStart,
    blockCommentEnd: meta.blockCommentEnd,
    fold: meta.fold,
    closeBrackets: meta.closeBrackets
  };
  if (meta.dontIndentStates) {
    mode.indent = function(state, textAfter, line) {
      if (meta.dontIndentStates.indexOf(state.state) > -1) return CodeMirror.Pass;
      return mode.indent(state, textAfter, line);
    };
  }
  return mode;
};

function ensureState(states, name) {
  if (!states[name])
    throw new Error("Undefined state " + name + " in simple mode");
}

function toRegex(val, caret) {
  if (!val) return /(?:)/;
  var flags = "";
  if (val instanceof RegExp) {
    if (val.ignoreCase) flags = "i";
    val = val.source;
  } else {
    val = String(val);
  }
  return new RegExp((caret === false ? "" : "^") + "(?:" + val + ")", flags);
}

function asToken(val) {
  if (!val) return null;
  if (val.apply) return val;
  if (typeof val == "string") return val.replace(/\./g, " ");
  var result = [];
  for (var i = 0; i < val.length; i++)
    result.push(val[i] && val[i].replace(/\./g, " "));
  return result;
}

function Rule(data, states) {
  if (data.next || data.push) ensureState(states, data.next || data.push);
  this.regexp = toRegex(data.regex);
  this.token = asToken(data.token);
  this.data = data;
}

function enterLocalMode(config, state, spec, token) {
  var pers;
  if (spec.persistent) for (var p = state.persistentStates; p && !pers; p = p.next)
    if (spec.mode == p.spec.mode && (!spec.spec || spec.spec == p.spec.spec)) pers = p;
  var mode = pers
    ? pers.mode
    : spec.mode
      ? CodeMirror.getMode(config, spec.mode)
      : CodeMirror.getMode(config, spec);
  var lState = pers ? pers.state : CodeMirror.startState(mode);
  if (spec.persistent && !pers)
    state.persistentStates = {mode: mode, spec: spec, state: lState, next: state.persistentStates};
  state.localState = lState;
  state.local = {
    mode: mode,
    end: spec.end && toRegex(spec.end),
    endScan: spec.end && spec.forceEnd !== false && toRegex(spec.end, false),
    endToken: token && token.join ? token[token.length - 1] : token
  };
}

});
