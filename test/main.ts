import {Observable as O} from 'rxjs'
import {run} from '@cycle/rxjs-run'
import {makeDOMDriver, div} from '@cycle/dom'
import {makeMapJSONDriver} from '../main'


function main(sources) {
  const drag$ = sources.MapJSON.select('mapdiv').events('dragend')
  drag$.subscribe(ev => {
    console.log('dragend', ev)
  })

  const markerclick$ = sources.MapJSON.select('mapdiv').markers('*').events('click')
  markerclick$.subscribe(ev => {
    console.log('markerclick', ev)
    console.log(ev.latLng.lat())
  })

  const markers = {
    "1": {
      position: {lng: -74.5, lat: 40}
    }
  }

  const anchorId = `mapdiv`
  const descriptor = {
    map: {
      container: anchorId, 
      //style: `mapbox://styles/mapbox/bright-v9`, // stylesheet location
      center: [-74.50, 40], // starting position
      zoom: 9, // starting zoom,
      dragPan: true,
      scrollZoom: false,
      offset: [500, 50]
    },
    markers
  }

  return {
    DOM: O.of(div([
      div(`#${anchorId}`, []),
    ])),
    MapJSON: O.merge(
      O.of(descriptor),
      O.of(copy(descriptor)).delay(2000).map(d => {
        d.map.center = [-80, 50]
        return d
      }),
      O.of(copy(descriptor)).delay(4000).map(d => {
        d.map.zoom = 16
        return d
      })
    )
  }





}

const copy = v => JSON.parse(JSON.stringify(v))

run(main, {
  DOM: makeDOMDriver(`#app`),
  MapJSON: makeMapJSONDriver()
})