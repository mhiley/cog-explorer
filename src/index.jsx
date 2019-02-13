// TODO currently assuming ol object is available on window via <script> tag
//      should figure out proper way to do this using webpack externals or vendor bundle
//      .. or something
const Map = window.ol.Map;
const View = window.ol.View;
const TileLayer = window.ol.layer.Tile;
const XYZ = window.ol.source.XYZ;


import CogAdapter from './components/mapview';

const createMap = (targetId) => {
  const map = new Map({
    target: targetId,
    layers: [
      new TileLayer({
        extent: [-180, -90, 180, 90],
        source: new XYZ({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          attributions: ['Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'],
        }),
      }),
    ],
    view: new View({
      projection: 'EPSG:4326',
      center: [0, 0],
      zoom: 5,
      // maxZoom: 13,
      minZoom: 3,
      maxZoom: 23,
    }),
  });
  return map;
};

module.exports = {
  CogAdapter,
  createMap
};
