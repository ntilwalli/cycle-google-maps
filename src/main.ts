import {Observable as O} from 'rxjs'
import * as jsondiffpatch from 'jsondiffpatch'
import rxjsSA from '@cycle/rxjs-adapter'

const g_unanchoredLedger = {}

function fromEvent(diffMap: any, eventName) {
  return O.create(observer => {
    const handler = ev => {
      observer.next(ev)
    }

    const listener = google.maps.event.addListener(diffMap, eventName, handler)

    return () => google.maps.event.removeListener(listener)
  }).publish().refCount()
}

function diff(previous, current) {
  return jsondiffpatch.diff(previous, current)
}

function patch(diffMap, previousDescriptor, descriptor) {
  const delta = diff(previousDescriptor, descriptor)
  // console.log(`previous`, previousDescriptor)
  // console.log(`current`, descriptor)
  // console.log(`delta`, delta)
  if (delta) {
    const {map, markers} = delta

    if (map) {
      patchMap(diffMap, map, descriptor.map)
    }

    if (markers) {
      patchMarkers(diffMap, markers, descriptor.markers)
    }
  }

  return descriptor
}

function patchMap(diffMap, delta, descriptor) {
  if (delta) {
    console.log('map delta', delta)
    if (delta.center) {
      diffMap.setCenter(normalizeLngLat(descriptor.center))
    }
  }
}

function patchMarkers(diffMap, delta, descriptor) {
  if (delta) {
    console.log('markers delta', delta)
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

function get_center_with_offset(map, center, zoom, offset) {

    const offset_x = offset ? Array.isArray(offset) ? offset[0] : offset.x : 0
    const offset_y = offset ? Array.isArray(offset) ? offset[1] : offset.y : 0
    //const stuff = new google.maps.LatLng(normalizeLngLat(center))
    const point1 = map.getProjection().fromLatLngToPoint(
        (center instanceof google.maps.LatLng) ? center : new google.maps.LatLng(normalizeLngLat(center))
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


function diffAndPatch(descriptor) {
  if (typeof descriptor === `undefined` || !descriptor) { return undefined }

  const anchorId = descriptor.map.container
  const anchor = document.getElementById(anchorId)

  if (!anchor) {
    g_unanchoredLedger[anchorId] = descriptor
    return O.never()
  } else {
    let diffMap = (<any> anchor).diffMap
    if (!diffMap) {
      const {map, markers} = descriptor
      const {center, zoom, offset} = map

      if (!center || !zoom) {
        throw new Error("Map descriptor requires center and zoom")
      }

      diffMap = new google.maps.Map(anchor, {
        center: normalizeLngLat(center),
        zoom,
        disableDefaultUI: true,
        draggable: !!(map && (map.draggable || map.dragPan)),//false,
        scrollwheel: !!(map && (map.scrollwheel || map.scrollZoom)),//false,
        zoomControl: !!(map && map.scrollZoom),
        mapTypeControl: false,
        scaleControl: false,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false
      })

      const map_markers = {}
      if (markers) {
        if (typeof markers === 'object' && markers !== null) {
          Object.keys(markers).forEach(key => {
            const m = markers[key]
            map_markers[key] = new google.maps.Marker({
              ...m,
              position: normalizeLngLat(m.position),
              map: diffMap
            })
          }) 
        } else {
          throw new Error ('Descriptor markers must be an object')
        }
      }

      diffMap.markers = map_markers
      
      return O.create(observer => {
        diffMap.addListener('tilesloaded', function () {
          ;(<any> anchor).diffMap = diffMap
          ;(<any> anchor).previousDescriptor = descriptor

          if (offset) {
            diffMap.setCenter(get_center_with_offset(diffMap, center, zoom, offset))
          }

          observer.next(descriptor)
          observer.complete()
        })
      })
    } else {
      let processing = (<any> anchor).diffMapProcessing
      if (!processing) {
        ;(<any> anchor).diffMapProcessing = true
        const previousDescriptor = (<any> anchor).previousDescriptor
        const out = O.of(patch(diffMap, previousDescriptor, descriptor))
        ;(<any> anchor).previousDescriptor = descriptor
        ;(<any> anchor).diffMapProcessing = false

        const queued = (<any> anchor).descriptorQueue
        if (queued && Array.isArray(queued)) {
          while (queued.length) {
            const d = queued.shift()
            return diffAndPatch(d)
          }
        }

        return out
      } else {
        const queued = (<any> anchor).descriptorQueue
        if (queued && Array.isArray(queued)) {
          queued.push(descriptor)
        } else {
          ;(<any> anchor).descriptorQueue = [descriptor]
        }

        return O.never()
      }
    }
  }
}

function renderRawRootElem$(descriptor$, accessToken) {

  const mutation$ = O.create(observer => {
    const mObserver = new MutationObserver(m => observer.next(m))
    const config = { childList: true, subtree: true };
    mObserver.observe(document, config);
    return () => { mObserver.disconnect(); }
  })

  const fromMutation$ = mutation$
    .switchMap(() => {
      let anchorId
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
    .mergeMap(descriptor => {
      return diffAndPatch(descriptor)
    })
    .publish().refCount()

  return patch$
}

function makeInstanceEventsSelector(markers$, runSA) {
  return function mapEvents(eventName) {
    if (typeof eventName !== `string`) {
      throw new Error(`MapboxGL driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`)
    }

    const out$ = markers$.switchMap(markers => {
      if (markers && Array.isArray(markers) && markers.length) {
        return O.merge(...markers.map(m => fromEvent(m, eventName)))
      } else {
        return O.never()
      }
    })
    .publish().refCount()

    const observable = runSA ? runSA.adapt(out$, rxjsSA.streamSubscribe) : out$
    return observable
  }
}

function makeMarkerInstanceSelector(diffMap$, runSA) {
  return function markerInstance(selector) {
    if (typeof selector !== `string`) {
      throw new Error(`MapboxGL driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`)
    }

    const out$ = diffMap$.map(diffMap => {
      const markers = diffMap.markers
      if (selector === '*') {
        return Object.keys(markers).map(key => markers[key])
      } else {
        return [markers[selector]]
      }
    })
    .publish().refCount()

    const observable = runSA ? runSA.adapt(out$, rxjsSA.streamSubscribe) : out$
    return {
      observable,
      events: makeInstanceEventsSelector(out$, runSA)
    }
  }
}

function makeMapEventsSelector(diffMap$, runSA) {
  return function mapEvents(eventName) {
    if (typeof eventName !== `string`) {
      throw new Error(`MapboxGL driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`)
    }

    const out$ = diffMap$.switchMap(diffMap => {
      return fromEvent(diffMap, eventName)
    })
    .publish().refCount()

    const observable = runSA ? runSA.adapt(out$, rxjsSA.streamSubscribe) : out$
    return observable
  }
}

function makeMapSelector(applied$, runSA) {
  return function select(anchorId) {
    //console.log(`choosing map: ${anchorId}`)
    const diffMap$ = applied$
      .map(() => document.getElementById(anchorId))
      .filter(x => !!x)
      .distinctUntilChanged(
        x => x && (<any> x).diffMap
      )
      .map(x => x.diffMap)
      .publishReplay(1).refCount()

    return {
      observable: runSA ? runSA.adapt(diffMap$, rxjsSA.streamSubscribe) : diffMap$,
      events: makeMapEventsSelector(diffMap$, runSA),
      markers: makeMarkerInstanceSelector(diffMap$, runSA),
    }
  }
}

export function makeMapJSONDriver(accessToken: string) {
  // if (!accessToken || (typeof(accessToken) !== 'string')) throw new Error(`MapDOMDriver requires an access token.`)

  // if(!mapboxgl.accessToken) {
  //   mapboxgl.accessToken = accessToken
  // }

  function mapJSONDriver(descriptor$, runSA?) {

    let adapted$
    if (runSA) {
      adapted$ = rxjsSA.adapt(descriptor$, runSA.streamSubscribe)
        .publishReplay(1).refCount()
    } else {
      adapted$ = descriptor$
        .publishReplay(1).refCount()
    }

    const  applied$ = renderRawRootElem$(adapted$, accessToken)


    applied$.subscribe()

    return {
      select: makeMapSelector(applied$, runSA)
    }
  }

  ;(<any> mapJSONDriver).streamAdapter = rxjsSA
  return mapJSONDriver
}