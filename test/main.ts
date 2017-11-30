import {Observable as O} from 'rxjs'
import {run} from '@cycle/rxjs-run'
import {makeDOMDriver, div, button} from '@cycle/dom'
import {makeMapJSONDriver} from '../main'
import _ = require('lodash')


function intent(sources) {
  const {MapJSON, DOM} = sources
  const drag$ = MapJSON.select('map_anchor').events('dragend')
  
  // drag$.subscribe(ev => {
  //   console.log('dragend', ev)
  // })

  const markerclick$ = MapJSON.select('map_anchor').markers('*').events('click')
  
  // markerclick$.subscribe(ev => {
  //   console.log('markerclick', ev)
  //   console.log(ev.latLng.lat())
  // })

  const show$ = DOM.select('.appShow').events('click')
  const hide$ = DOM.select('.appHide').events('click')

  return {
    drag$, markerclick$, show$, hide$
  }
}

function model(actions) {
  const show_modal_r = actions.show$.map(_ => state => {
    return {
      ...state,
      show: true, 
      iteration: state.iteration + 1
    }
  })

  const hide_modal_r = actions.hide$.map(_ => state => {
    return {
      ...state,
      show: false
    }
  })

  const drag_r = actions.drag$.map(ev => state => {
    console.log(ev)
    return state
  })

  const markerclick_r = actions.markerclick$.map(ev => state => {
    console.log(ev)
    return state
  })

  const shift_marker_r = O.of({id: 1, position: {lng: -80, lat: 50}}).delay(5000).map(ev => state => {
    console.log(ev)
    return {
      ...state,
      markers: {
        ...state.markers,
        [ev.id.toString()] : {
          position: ev.position
        }
      }
    }
  })

  const shift_center_r = O.of({lng: -80, lat: 50}).delay(6000).map(center => state => {
    return {
      ...state,
      center
    }
  })

  const reducer$ = O.merge(
    hide_modal_r, show_modal_r, drag_r, 
    markerclick_r, shift_marker_r, shift_center_r
  )

  const init = {
    show: false,
    anchor_id: 'map_anchor',
    center: {lng: -74.5, lat: 40}, 
    markers: {
      "1": {
        position: {lng: -74.5, lat: 40}
      }
    },
    iteration: 0
  }

  return reducer$
    .startWith(init)
    .scan((acc, f: Function) => {
      return f(acc)
    })
    .publishReplay(1).refCount()

}

function view(state$) {
  return state$.map(state => {
    return div([
      state.show ? div('.modal', [
        div('.box', [
          button('.appHide', ['Hide'])
        ]),
        div('.background', [])
      ]) : div([
        button('.appShow', ['Show'])
      ]),
      div(`#${state.anchor_id}._${state.iteration}`, []),
    ])
  })
}


function mapview(state$) {
  return state$.map(state => {
    const {markers, center, anchor_id} = state
    const descriptor = {
      map: {
        container: anchor_id, 
        //style: `mapbox://styles/mapbox/bright-v9`, // stylesheet location
        center: [center.lng, center.lat], // starting position
        zoom: 9, // starting zoom,
        dragPan: true,
        scrollZoom: true,
        offset: [0, 0]
      },
      markers
    }

    return descriptor
  })
}


function main(sources) {
  const actions = intent(sources)
  const state$ = model(actions)

  return {
    DOM: view(state$),
    MapJSON: mapview(state$)
  }

}

const copy = v => JSON.parse(JSON.stringify(v))

run(main, {
  DOM: makeDOMDriver(`#app`),
  MapJSON: makeMapJSONDriver()
})