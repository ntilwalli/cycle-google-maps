import {Observable as O} from 'rxjs'
import jsondiffpatch = require('jsondiffpatch')
import {adapt} from '@cycle/run/lib/adapt'

const g_unanchoredLedger = {}

const isAdded = diff => diff.length === 1
const isUpdated = diff => diff.length === 2
const isDeleted = diff => diff.length === 3


function fromEvent(diff_map: any, instance: any, eventName) {
  return O.create(observer => {
    const handler = ev => {
      observer.next({
        ...ev, 
        diff_map
      })
    }

    const listener = google.maps.event.addListener(instance, eventName, handler)

    return () => google.maps.event.removeListener(listener)
  }).publish().refCount()
}


function makeInstanceEventsSelector(instances$) {
  return function mapEvents(eventName) {
    if (typeof eventName !== `string`) {
      throw new Error(`Map driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`)
    }

    const out$ = instances$.switchMap(({diff_map, instances}) => {
      if (instances && Array.isArray(instances) && instances.length) {
        return O.merge(...instances.map(m => {
          return fromEvent(diff_map, m, eventName)
        }))
      } else {
        return O.never()
      }
    })
    .publish().refCount()

    const observable = out$
    return adapt(observable)
  }
}

const withMap = (diff_map, instances) => ({diff_map, instances})

function makeMarkerInstanceSelector(diff_map$) {
  return function markerInstance(selector) {
    if (typeof selector !== `string`) {
      throw new Error(`Map driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`)
    }

    const out$ = diff_map$.map(diff_map => {
      const markers = diff_map.markers
      if (selector === '*') {
        return markers ? withMap(diff_map, Object.keys(markers).map(key => markers[key])) : withMap(diff_map, [])
      } else {
        return markers && markers[selector] ? withMap(diff_map, [markers[selector]]) : withMap(diff_map, [])
      }
    })
    .publish().refCount()

    const observable = out$
    return {
      observable: adapt(observable),
      events: makeInstanceEventsSelector(out$)
    }
  }
}

function makeCircleInstanceSelector(diff_map$) {
  return function circleInstance(selector) {
    if (typeof selector !== `string`) {
      throw new Error(`Map driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`)
    }

    const out$ = diff_map$.map(diff_map => {
      const circles = diff_map.circles
      if (selector === '*') {
        return circles ? withMap(diff_map, Object.keys(circles).map(key => circles[key])) : withMap(diff_map, [])
      } else {
        return circles && circles[selector] ? withMap(diff_map, [circles[selector]]) : withMap(diff_map, [])
      }
    })
    .publish().refCount()

    const observable = out$
    return {
      observable: adapt(observable),
      events: makeInstanceEventsSelector(out$)
    }
  }
}

function makeInfoWindowInstanceSelector(diff_map$) {
  return function infoWindowInstance(selector) {
    if (typeof selector !== `string`) {
      throw new Error(`Map driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`)
    }

    const out$ = diff_map$.map(diff_map => {
      const info_windows = diff_map.info_windows
      if (selector === '*') {
        return info_windows ? withMap(diff_map, Object.keys(info_windows).map(key => info_windows[key])) : withMap(diff_map, [])
      } else {
        return info_windows && info_windows[selector] ? withMap(diff_map, [info_windows[selector]]) : withMap(diff_map, [])
      }
    })
    .publish().refCount()

    const observable = out$
    return {
      observable: adapt(observable),
      events: makeInstanceEventsSelector(out$)
    }
  }
}



function makeMapEventsSelector(diff_map$) {
  return function mapEvents(eventName) {
    if (typeof eventName !== `string`) {
      throw new Error(`Map driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`)
    }

    const out$ = diff_map$.switchMap(diff_map => {
      return fromEvent(diff_map, diff_map, eventName)
    })
    .publish().refCount()

    const observable = out$
    return adapt(observable)
  }
}

function makeMapSelector(applied$) {
  return function select(anchorId) {
    //console.log(`choosing map: ${anchorId}`)
    const diff_map$ = applied$
      .map(() => {
        const out = document.getElementById(anchorId)
        return out
      })
      .filter(x => {
        return x && x.diff_map
      })
      .map(x => {
        return x.diff_map
      })
      .publishReplay(1).refCount()

    return {
      observable: adapt(diff_map$),
      events: makeMapEventsSelector(diff_map$),
      markers: makeMarkerInstanceSelector(diff_map$),
      circles: makeCircleInstanceSelector(diff_map$), 
      info_windows: makeInfoWindowInstanceSelector(diff_map$)
    }
  }
}





function diff(previous, current) {
  return (jsondiffpatch as any).diff(previous, current)
}

function patch(diff_map, previousDescriptor, descriptor) {
  const delta = diff(previousDescriptor, descriptor)
  // console.log(`previous`, previousDescriptor)
  // console.log(`current`, descriptor)
  // console.log(`delta`, delta)
  if (delta) {
    const {map, markers, circles, info_windows} = delta

    if (map) {
      patchMap(diff_map, map, descriptor.map)
    }

    if (markers) {
      if (Array.isArray(markers)) {
        if (markers.length === 1) {
          addMarkers(markers[0], diff_map)
        }
      } else {
        patchMarkers(diff_map, markers, descriptor.markers)
      }
    }

    if (circles) {
      if (Array.isArray(circles)) {
        if (circles.length === 1) {
          addCircles(circles[0], diff_map)
        }
      } else {
        patchCircles(diff_map, circles, descriptor.circles)
      }
    }


    if (info_windows) {
      if (Array.isArray(info_windows)) {
        const len = info_windows.length
        if (len === 1) {
          addInfoWindows(info_windows[0], diff_map)
        } else if (len === 2) {
          throw new Error()
        } else if (len === 3) {
          const iws = diff_map.info_windows
          Object.keys(iws).forEach(key => iws[key].close())
          diff_map.info_windows = undefined
        }
      } else {
        patchInfoWindows(diff_map, info_windows, descriptor.info_windows)
      }
    }
  } else {
    google.maps.event.trigger(diff_map, 'resize')
  }

  // if (descriptor.options && descriptor.options.marker_fit_bounds) { 
  //   marker_fit_bounds(diff_map) 
  // } 

  return descriptor
}

const TOLERANCE = .0005

const toLngLat = x => {
  return {
    lat: x.lat(),
    lng: x.lng()
  }
}

function patchMap(diff_map, map_delta, map_descriptor) {
  if (map_delta.zoom) {
    const newZoom = map_descriptor.zoom
    //if (newZoom !== diff_map.getZoom()) {
      diff_map.setZoom(newZoom)
    //}
  }

  if (map_delta.center) {
    let offset = map_descriptor.offset
    let center = map_descriptor.center
    let new_center = offset ? getCenterWithOffset(diff_map, center, diff_map.getZoom(), offset) : normalizeLngLat(center)
    let map_center = diff_map.getCenter()
    //if (Math.abs(map_center.lat() - newCenter.lat) > TOLERANCE || Math.abs(map_center.lng() - newCenter.lng) > TOLERANCE) {
      diff_map.setCenter(new_center)
    //}
  }
}


function patchMarkers(diff_map, delta, descriptor) {
  if (delta) {
    const markers = diff_map.markers

    Object.keys(delta).forEach(key => {
      const diff = delta[key]
      if (Array.isArray(diff)) {
        if (isAdded(diff)) {
          markers[key] = getMarker(diff[0], diff_map)
        } else if (isUpdated(diff)) {
          const update = diff[1]
          if (update.position) {
            markers[key].setPosition(normalizeLngLat(descriptor[key].position))
          }
          if (update.title) {
            markers[key].setTitle(descriptor[key].title)
          }

          if (update.icon) {
            markers[key].setIcon(descriptor[key].icon)
          }

        } else if (isDeleted(diff)) {
          const deleted = markers[key]
          deleted.setMap(null)
          delete markers[key]
        }
      } else {
        Object.keys(diff).forEach(property => {
          const marker_diff = diff[property]
          if (isAdded(marker_diff)) {

          } else if (isUpdated(marker_diff)) {
            const update = marker_diff[1]
            if (property === 'position') {
              markers[key].setPosition(normalizeLngLat(update))
            }
            if (property === 'title') {
              markers[key].setTitle(update)
            }
  
            if (property === 'icon') {
              markers[key].setIcon(update)
            }
  
          } else if (isDeleted(marker_diff)) {

          }
        })
      }
    })
  }
}

function patchCircles(diff_map, delta, descriptor) {
  if (delta) {
    const circles = diff_map.circles

    Object.keys(delta).forEach(key => {
      const diff = delta[key]
      if (isAdded(diff)) {
        circles[key] = getCircle(diff[0], diff_map)
      } else if (isUpdated(diff)) {
        const update = diff[1]
        if (update.center) {
          circles[key].setCenter(normalizeLngLat(descriptor[key].center))
        }

        if (update.radius) {
          circles[key].setRadius(normalizeLngLat(descriptor[key].radius))
        }

        if (update.options) {

        }
      } else if (isDeleted(diff)) {
        const deleted = circles[key]
        deleted.setMap(null)
        delete circles[key]
      }
    })
  }
}

function updateInfoWindow(iw, diff, descriptor) {
  if (diff.position) {
    iw.setPosition(normalizeLngLat(descriptor.position))
  }

  if (diff.content) {
    iw.setContent(descriptor.content)
  }
}

function patchInfoWindows(diff_map, delta, descriptor) {
  if (delta) {
    const info_windows = diff_map.info_windows

    Object.keys(delta).forEach(key => {
      const diff = delta[key]
      if (Array.isArray(diff)) {
        if (isAdded(diff)) {
          info_windows[key] = getInfoWindow(diff[0])
          info_windows[key].open(diff_map)
        } else if (isUpdated(diff)) {
          const update = diff[1]
          updateInfoWindow(info_windows[key], update, descriptor[key])
        } else if (isDeleted(diff)) {
          const deleted = info_windows[key]
          deleted.close()
          deleted.setMap(null)
          delete info_windows[key]
        }
      } else {
        updateInfoWindow(info_windows[key], diff, descriptor[key])
      }
    })
  }
}




function normalizeLngLat(val) {
  if (val) {
    if (Array.isArray(val) && val.length === 2) {
      return {
        lng: val[0],
        lat: val[1]
      }
    } else if (val.lng && val.lat) {
      return val
    }
  }

  throw new Error("Invalid lng/lat info given")
}

function getInfoWindow(m) {
  return new google.maps.InfoWindow({
    content: m.content,
    position: m.position
  })
}

function normalizeIcon(val) {
  const val_type = typeof val
  if (val) {
    if (val_type === 'string') {
      return val
    } else if (val_type === 'object') {
      if (val.path === 'circle') {
        return {
          ...val,
          path: google.maps.SymbolPath.CIRCLE
        }
      }
    }
  }

  return undefined
}

function getMarker(m, diff_map) {
  return new google.maps.Marker({
    position: normalizeLngLat(m.position),
    icon: normalizeIcon(m.icon),
    title: m.title || undefined,
    map: diff_map
  })
}

function getCircle(m, diff_map) {

  let out = {
    center: normalizeLngLat(m.center),
    radius: m.radius || 10,
    map: diff_map,
    strokeColor: '#FF0000',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: '#FF0000',
    fillOpacity: 0.35,
  }

  if (m.options) {
    out = {
      ...out,
      ...m.options
    }
  }

  return new google.maps.Circle(out)
}


function getCenterWithOffset(map, center, zoom, offset) {

    const offset_x = offset ? Array.isArray(offset) ? offset[0] : offset.x : 0
    const offset_y = offset ? Array.isArray(offset) ? offset[1] : offset.y : 0
    //const stuff = new google.maps.LatLng(normalizeLngLat(center))
    const point1 = map.getProjection().fromLatLngToPoint(
        (center instanceof google.maps.LatLng) ? center : new (google as any).maps.LatLng(normalizeLngLat(center))
    );
    const point2 = new google.maps.Point(
        ( (typeof(offset_x) == 'number' ? offset_x : 0) / Math.pow(2, zoom)) || 0,
        ( (typeof(offset_y) == 'number' ? offset_y : 0) / Math.pow(2, zoom)) || 0
    );  
    return map.getProjection().fromPointToLatLng(new google.maps.Point(
        point1.x - point2.x,
        point1.y + point2.y
    ));
}


function getAnchorId(descriptor) {
  return descriptor.map.container
}

function getAnchor(descriptor) {
  return document.getElementById(getAnchorId(descriptor))
}

function addToUnanchoredLedger(anchor_id, descriptor) {
  g_unanchoredLedger[anchor_id] = descriptor
}

function getMap(anchor) {
  return (<any> anchor).diff_map
}

function addDescriptorToQueue(anchor, descriptor) {
  (<any> anchor).descriptor_queue.push(descriptor)
}

function isLoading(anchor) {
  return (<any> anchor).loading === true
}

function processQueue(anchor) {
  const descriptor_queue = (<any> anchor).descriptor_queue
  const diff_map = (<any> anchor).diff_map
  let previous_descriptor, descriptor
  while (descriptor_queue.length) {
    previous_descriptor = (<any> anchor).previous_descriptor
    descriptor = descriptor_queue.shift()
    patch(diff_map, previous_descriptor, descriptor)
    ;(<any> anchor).previous_descriptor = descriptor
  }

  return O.of(descriptor)
}

// function marker_fit_bounds(diff_map) {
//   const markers_map = diff_map.markers
//   const markers = Object.keys(markers_map).map(key => markers_map[key])
//   const bound = new google.maps.LatLngBounds()
//   for(let i in markers)
//   {
//     bound.extend(markers[i].getPosition());
//   }

//   console.log('bound', bound)
//   //diff_map.fitBounds(bound)
//   // const zoom = diff_map.getZoom()
//   // diff_map.setZoom(zoom - 1)
// }

function addMarkers(markers, diff_map) {
  const map_markers = {}
  if (markers) {
    Object.keys(markers).forEach(key => {
      const m = markers[key]
      map_markers[key] = getMarker(m, diff_map)
    }) 

    diff_map.markers = map_markers
  }
}

function addCircles(circles, diff_map) {
  const map_circles = {}
  if (circles) {
    Object.keys(circles).forEach(key => {
      const m = circles[key]
      map_circles[key] = getCircle(m, diff_map)
    }) 

    diff_map.circles = map_circles
  }
}

function addInfoWindows(iws, diff_map) {
  const map_iws = {}
  if (iws) {
    Object.keys(iws).forEach(key => {
      const m = iws[key]
      map_iws[key] = getInfoWindow(m)
      const out = map_iws[key].open(diff_map)
    }) 

    diff_map.info_windows = map_iws
  }
}


function createMap(anchor, descriptor) {
  let diff_map
  const {map, markers, circles, info_windows} = descriptor
  const {center, zoom, offset} = map

  if (!center || !zoom) {
    throw new Error("Map descriptor requires center and zoom")
  }

  diff_map = new google.maps.Map(anchor, {
    center: normalizeLngLat(center),
    zoom,
    disableDefaultUI: true,
    draggable: !!(map && (map.draggable || map.drag_pan)),//false,
    scrollwheel: !!(map && (map.scrollwheel || map.scroll_zoom)),//false,
    zoomControl: !!(map && map.scroll_zoom),
    mapTypeControl: false,
    scaleControl: false,
    streetViewControl: false,
    rotateControl: false,
    fullscreenControl: false
  })

  addMarkers(markers, diff_map)
  //if (descriptor.options && descriptor.options.marker_fit_bounds) { marker_fit_bounds(diff_map) } 
  addCircles(circles, diff_map)
  addInfoWindows(info_windows, diff_map)

  ;(<any> anchor).diff_map = diff_map 
  ;(<any> anchor).previous_descriptor = descriptor
  ;(<any> anchor).descriptor_queue = []
  ;(<any> anchor).loading = true
  
  return O.create(observer => {
    const listener_id = diff_map.addListener('tilesloaded', function () {
      if (offset) {
        diff_map.setCenter(
          getCenterWithOffset(
            diff_map, 
            center, 
            zoom, 
            offset
          )
        )

      }

      ;(<any> anchor).loading = false
      observer.next(descriptor)
      observer.complete()
      google.maps.event.removeListener(listener_id)
    })
  })
  .map(descriptor => {
    const anchor = getAnchor(descriptor)
    return processQueue(anchor)
  })
}


function renderRawRootElem$(descriptor$, accessToken?) {

  const mutation$ = O.create(observer => {
    const mObserver = new MutationObserver(m => observer.next(m))
    const config = { childList: true, subtree: true };
    mObserver.observe(document, config);
    return () => { mObserver.disconnect(); }
  })

  const fromMutation$ = mutation$
    .switchMap(m => {
      let anchorId, foo
      let mutation = m

      // if (foo = m.find(x => x.addedNodes.length)) {
      //   let added = foo.addedNodes[0]
      //   if (global_anchor && hasIdInTree(global_anchor, added)) {
      //     console.log('Added')
      //   }
      // }

      // if (foo = m.find(x => x.removedNodes.length)) {
      //   let removed = foo.removedNodes[0]
      //   if (global_anchor && hasIdInTree(global_anchor, removed)) {
      //     console.log('Removed')
      //   }
      // }

      const buffer = []
      for (anchorId in g_unanchoredLedger) {
        const anchor = document.getElementById(anchorId)
        if (anchor) {
          const cachedDescriptor = g_unanchoredLedger[anchorId]
          delete g_unanchoredLedger[anchorId]
          buffer.push(cachedDescriptor)
        }
      }

      if (buffer.length) {
        return O.from(buffer)
      } else {
        return O.never()
      }
    })

  const patch$ = O.merge(descriptor$, fromMutation$)
    .mergeMap((descriptor: any) => {
      const anchor_id = getAnchorId(descriptor)
      const anchor: any = getAnchor(descriptor)
    
      if (!anchor) {
        addToUnanchoredLedger(anchor_id, descriptor)
        return O.never()
      } else {
        if (!getMap(anchor)) {
          return createMap(anchor, descriptor)
        } else {
          if (isLoading(anchor)) {
            addDescriptorToQueue(anchor, descriptor)
            google.maps.event.trigger(anchor.diff_map, 'resize')
            return O.never()
          } else {
            addDescriptorToQueue(anchor, descriptor)
            return processQueue(anchor)
          }
        }
      }
    })
    .publishReplay(1).refCount()

  return patch$
    .map(x => {
      return x
    })
}

export function makeMapJSONDriver(accessToken?: string) {
  // if (!accessToken || (typeof(accessToken) !== 'string')) throw new Error(`MapDOMDriver requires an access token.`)

  // if(!mapboxgl.accessToken) {
  //   mapboxgl.accessToken = accessToken
  // }

  function mapJSONDriver(descriptor$) {

    let adapted$ = O.from(descriptor$).publishReplay(1).refCount()
    const applied$ = renderRawRootElem$(adapted$, accessToken)


    applied$.subscribe()

    return {
      select: makeMapSelector(applied$)
    }
  }

  //;(<any> mapJSONDriver).streamAdapter = rxjsSA
  return mapJSONDriver
}