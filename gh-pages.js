;(function () {
  var REPO_PREFIX = '/Dynamic-Visualization-Dashboard-for-Global-National-and-Provincial-Healthcare-Data'
  var host = window.location.hostname || ''
  if (!/github\.io$/i.test(host)) return

  var ROUTE_MAP = {
    '/bigbig_screen/': '/global-screen/',
    '/two_bigscreen/': '/china-screen/',
    '/screen/': '/province-screen/',
    '/global-screen/': '/global-screen/',
    '/china-screen/': '/china-screen/',
    '/province-screen/': '/province-screen/'
  }

  function normalizePath(pathname) {
    if (!pathname) return pathname
    var normalized = pathname
    if (!normalized.endsWith('/')) normalized += '/'
    return normalized
  }

  function withRepoPrefix(pathname) {
    var normalized = normalizePath(pathname)
    if (!normalized) return normalized
    var mapped = ROUTE_MAP[normalized] || normalized
    if (mapped.indexOf(REPO_PREFIX + '/') === 0) return mapped
    return REPO_PREFIX + (mapped.startsWith('/') ? mapped : '/' + mapped)
  }

  function rewriteIfNeeded() {
    var currentPath = window.location.pathname || '/'
    if (currentPath.indexOf(REPO_PREFIX + '/') === 0) return

    var target = withRepoPrefix(currentPath)
    if (!target || target === currentPath) return
    window.location.replace(target + window.location.search + window.location.hash)
  }

  function rewriteAnchorHref(anchor) {
    if (!anchor || !anchor.getAttribute) return
    var raw = anchor.getAttribute('href')
    if (!raw) return
    if (/^(https?:|mailto:|tel:|#)/i.test(raw)) return
    if (!raw.startsWith('/')) return
    if (raw.indexOf(REPO_PREFIX + '/') === 0) return

    var clean = raw.split('?')[0].split('#')[0]
    var mapped = withRepoPrefix(clean)
    if (!mapped) return
    anchor.setAttribute('href', raw.replace(clean, mapped))
  }

  function rewriteAllAnchors() {
    var anchors = document.querySelectorAll('a[href]')
    for (var i = 0; i < anchors.length; i++) rewriteAnchorHref(anchors[i])
  }

  function patchLocationLikeCalls() {
    var nativeOpen = window.open
    window.open = function (url, target, features) {
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith(REPO_PREFIX + '/')) {
        var clean = url.split('?')[0].split('#')[0]
        url = url.replace(clean, withRepoPrefix(clean))
      }
      return nativeOpen.call(window, url, target, features)
    }

    var loc = window.location
    try {
      var nativeAssign = loc.assign.bind(loc)
      loc.assign = function (url) {
        if (typeof url === 'string' && url.startsWith('/') && !url.startsWith(REPO_PREFIX + '/')) {
          var cleanAssign = url.split('?')[0].split('#')[0]
          url = url.replace(cleanAssign, withRepoPrefix(cleanAssign))
        }
        return nativeAssign(url)
      }
    } catch (_e) {}

    try {
      var nativeReplace = loc.replace.bind(loc)
      loc.replace = function (url) {
        if (typeof url === 'string' && url.startsWith('/') && !url.startsWith(REPO_PREFIX + '/')) {
          var cleanReplace = url.split('?')[0].split('#')[0]
          url = url.replace(cleanReplace, withRepoPrefix(cleanReplace))
        }
        return nativeReplace(url)
      }
    } catch (_e) {}

    try {
      var proto = window.Location && window.Location.prototype
      if (proto) {
        var protoAssign = proto.assign
        if (typeof protoAssign === 'function') {
          proto.assign = function (url) {
            if (typeof url === 'string' && url.startsWith('/') && !url.startsWith(REPO_PREFIX + '/')) {
              var cleanProtoAssign = url.split('?')[0].split('#')[0]
              url = url.replace(cleanProtoAssign, withRepoPrefix(cleanProtoAssign))
            }
            return protoAssign.call(this, url)
          }
        }

        var protoReplace = proto.replace
        if (typeof protoReplace === 'function') {
          proto.replace = function (url) {
            if (typeof url === 'string' && url.startsWith('/') && !url.startsWith(REPO_PREFIX + '/')) {
              var cleanProtoReplace = url.split('?')[0].split('#')[0]
              url = url.replace(cleanProtoReplace, withRepoPrefix(cleanProtoReplace))
            }
            return protoReplace.call(this, url)
          }
        }
      }
    } catch (_e) {}
  }

  rewriteIfNeeded()
  rewriteAllAnchors()
  patchLocationLikeCalls()

  document.addEventListener(
    'click',
    function (event) {
      var node = event.target
      while (node && node.tagName !== 'A') node = node.parentElement
      if (!node) return
      rewriteAnchorHref(node)
    },
    true
  )

  var observer = new MutationObserver(function () {
    rewriteAllAnchors()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
})()
