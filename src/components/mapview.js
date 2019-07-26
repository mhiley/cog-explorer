import proj4 from 'proj4';

import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import { transformExtent } from 'ol/proj';
import { register as registerProj4 } from 'ol/proj/proj4';
import { containsCoordinate } from 'ol/extent';

// NOTE you want to use this type of import for local testing:
// import { fromUrl, fromUrls, Pool } from 'geotiff';
// for stencil/typescript/rollup build, importing geotiff.js this way
// avoids lots of issues.
// inpsired by https://github.com/geotiffjs/geotiff.js/issues/53#issuecomment-407769548
import GeoTIFF from 'geotiff/dist/geotiff.bundle.min.js';
const { fromUrl, fromUrls, Pool } = GeoTIFF;

import CanvasTileImageSource from '../maputil';
import { renderData } from '../renderutils';

const FILL_VALUE = -999;

registerProj4(proj4);

/* eslint-disable no-console */
async function all(promises) {
  const result = await Promise.all(promises);
  return result;
}

class CogAdapter {
  constructor(olMapInstance) {
    this.map = olMapInstance;
    this.sceneLayers = {};
    this.sceneSources = {};
    this.tileCache = {};
    this.renderedTileCache = {};
    this.scenes = [];

    this.pool = new Pool();
  }

  async getImage(sceneId, url, hasOvr = true) {
    if (!this.sceneSources[sceneId]) {
      this.sceneSources[sceneId] = {};
    }
    if (!this.sceneSources[sceneId][url]) {
      if (hasOvr) {
        this.sceneSources[sceneId][url] = fromUrls(url, [`${url}.ovr`]);
      } else {
        this.sceneSources[sceneId][url] = fromUrl(url);
      }
    }
    return this.sceneSources[sceneId][url];
  }

  async getRawTile(tiff, url, z, x, y, isRGB = false, samples) {
    const id = `${url}-${samples ? samples.join(',') : 'all'}-${z}-${x}-${y}`;

    if (!this.tileCache[id]) {
      const image = await tiff.getImage(await tiff.getImageCount() - z - 1);

      // const poolSize = image.fileDirectory.Compression === 5 ? 4 : null;
      // const poolSize = null;

      const wnd = [
        x * image.getTileWidth(),
        image.getHeight() - ((y + 1) * image.getTileHeight()),
        (x + 1) * image.getTileWidth(),
        image.getHeight() - (y * image.getTileHeight()),
      ];

      if (isRGB) {
        this.tileCache[id] = image.readRGB({
          window: wnd,
          pool: image.fileDirectory.Compression === 5 ? this.pool : null,
        });
      } else {
        this.tileCache[id] = image.readRasters({
          window: wnd,
          samples,
          pool: image.fileDirectory.Compression === 5 ? this.pool : null,
          fillValue: FILL_VALUE,
        });
      }
    }

    return this.tileCache[id];
  }

  async addSceneLayer(scene) {
    console.log('scene: ', scene);
    this.scenes.push(scene);
    this.sceneSources[scene.id] = {
      [scene.redBand]: this.getImage(scene.id, scene.bands.get(scene.redBand), scene.hasOvr),
      [scene.greenBand]: this.getImage(scene.id, scene.bands.get(scene.greenBand), scene.hasOvr),
      [scene.blueBand]: this.getImage(scene.id, scene.bands.get(scene.blueBand), scene.hasOvr),
    };
    const tiff = await this.getImage(scene.id, scene.bands.get(scene.redBand), scene.hasOvr);

    // calculate tilegrid from the 'red' image
    const images = [];
    const count = await tiff.getImageCount();
    for (let i = 0; i < count; ++i) {
      images.push(await tiff.getImage(i));
    }
    console.log('images: ', images);

    const first = images[0];
    const resolutions = images.map((image => image.getResolution(first)[0]));
    const tileSizes = images.map((image => [image.getTileWidth(), image.getTileHeight()]));

    console.log('resolutions: ', resolutions);
    const tileGrid = new TileGrid({
      extent: first.getBoundingBox(),
      origin: [first.getOrigin()[0], first.getBoundingBox()[1]],
      resolutions: resolutions.reverse(),
      tileSizes: tileSizes.reverse(),
    });

    // proj setup?

    let epsgCode = first.geoKeys.ProjectedCSTypeGeoKey;
    if (!epsgCode) {
      epsgCode = first.geoKeys.GeographicTypeGeoKey;
    }
    const epsg = `EPSG:${epsgCode}`;

    if (!proj4.defs(epsg)) {
      const response = await fetch(`//epsg.io/${epsgCode}.proj4`);
      proj4.defs(epsg, await response.text());
      registerProj4(proj4); // per https://openlayers.org/en/latest/apidoc/module-ol_proj_proj4.html
    }

    const layer = new TileLayer({
      source: new CanvasTileImageSource({
        projection: epsg,
        tileGrid,
        tileRenderFunction: (...args) => this.renderTile(scene.id, ...args),
        attributions: scene.attribution,
      }),
    });

    this.map.addLayer(layer);
    this.sceneLayers[scene.id] = layer;

    const view = this.map.getView();

    const lonLatExtent = transformExtent(
      first.getBoundingBox(), epsg, this.map.getView().getProjection(),
    );

    // only animate to new bounds when center is not already inside image
    if (!containsCoordinate(lonLatExtent, view.getCenter())) {
      view.fit(
        lonLatExtent, {
          duration: 1000,
          padding: [0, 0, 0, 0],
        },
      );
    }
  }

  async renderTile(sceneId, canvas, z, x, y) {
    const id = `${z}-${x}-${y}`;

    if (!this.renderedTileCache[sceneId]) {
      this.renderedTileCache[sceneId] = {};
    }

    if (!this.renderedTileCache[sceneId][id]) {
      this.renderedTileCache[sceneId][id] = this.renderTileInternal(sceneId, canvas, z, x, y);
    }
    return this.renderedTileCache[sceneId][id];
  }

  async renderTileInternal(sceneId, canvas, z, x, y) {
    const scene = this.scenes.find(s => s.id === sceneId);

    if (!scene) {
      return;
    }

    if (scene.isRGB) { // && scene.isSingle) {
      const tiff = await this.getImage(sceneId, scene.bands.get(scene.redBand), scene.hasOvr);
      tiff.baseUrl = sceneId;
      console.time(`parsing ${sceneId + z + x + y}`);
      const data = await this.getRawTile(tiff, tiff.baseUrl, z, x, y, true);
      console.timeEnd(`parsing ${sceneId + z + x + y}`);
      const { width, height } = data;
      canvas.width = width;
      canvas.height = height;

      console.time(`rendering ${sceneId + z + x + y}`);
      // const ctx = canvas.getContext('2d');
      // const imageData = ctx.createImageData(width, height);
      // const out = imageData.data;
      // let o = 0;

      // let shift = 0;
      // if (data instanceof Uint16Array) {
      //   shift = 8;
      // }

      // for (let i = 0; i < data.length; i += 3) {
      //   out[o] = data[i] >> shift;
      //   out[o + 1] = data[i + 1] >> shift;
      //   out[o + 2] = data[i + 2] >> shift;
      //   out[o + 3] = data[i] || data[i + 1] || data[i + 2] ? 255 : 0;
      //   o += 4;
      // }
      // ctx.putImageData(imageData, 0, 0);

      renderData(canvas, scene.pipeline, width, height, data, null, null, true);
      console.timeEnd(`rendering ${sceneId + z + x + y}`);
    } else if (scene.isSingle) {
      const tiff = await this.getImage(sceneId, scene.bands.get(scene.redBand), scene.hasOvr);
      tiff.baseUrl = sceneId;
      console.time(`parsing ${sceneId + z + x + y}`);
      const data = await this.getRawTile(tiff, tiff.baseUrl, z, x, y, false, [
        scene.redBand, scene.greenBand, scene.blueBand,
      ]);
      console.timeEnd(`parsing ${sceneId + z + x + y}`);

      const { width, height } = data;
      canvas.width = width;
      canvas.height = height;

      console.time(`rendering ${sceneId + z + x + y}`);
      const [red, green, blue] = data;
      // console.log('data arrays: ', typeof(red), red);

      // mjh trying to get colorscale proof of concept to work
      // before implementing this more formally
      const redScaled = new Uint8Array(red.length);
      const greenScaled = new Uint8Array(green.length);
      const blueScaled = new Uint8Array(blue.length);
      const min = -0.2; // TODO get these from socket.io msg
      const max = 0.7;
      /* eslint-disable eqeqeq */
      for (let i = 0; i < red.length; i++) {
        redScaled[i] = 255 - (((red[i] - min) / (max - min)) * 255);
        if (red[i] < min) {
          redScaled[i] = 255;
        }
        if (red[i] > max) {
          redScaled[i] = 0;
        }
        if (red[i] == FILL_VALUE || red[i] == 0) {
          // There's an issue with the readRasters fillValue implementation -
          // sometimes it still return 0 instead of FILL_VALUE.
          // Problem is 0 (nodata/fill) is also valid NDVI value.
          // Note, Pixels with r,g,b all equal to zero will be discarded
          // (see webglrenderer frag shader).
          redScaled[i] = 0;
        }
      }
      for (let i = 0; i < green.length; i++) {
        greenScaled[i] = ((green[i] - min) / (max - min)) * 255;
        if (green[i] < min) {
          greenScaled[i] = 0;
        }
        if (green[i] > max) {
          greenScaled[i] = 255;
        }
        if (green[i] == FILL_VALUE || green[i] == 0) {
          greenScaled[i] = 0;
        }
      }
      for (let i = 0; i < blue.length; i++) {
        blueScaled[i] = 0;
        if (blue[i] == FILL_VALUE || blue[i] == 0) {
          blueScaled[i] = 0;
        }
      }
      /* eslint-enable eqeqeq */

      // const [red, green, blue] = [redArr, greenArr, blueArr].map(arr => arr[0]);
      renderData(canvas, scene.pipeline, width, height, redScaled, greenScaled, blueScaled, false);
      console.timeEnd(`rendering ${sceneId + z + x + y}`);
    } else {
      const [redImage, greenImage, blueImage] = await all([
        this.getImage(sceneId, scene.bands.get(scene.redBand), scene.hasOvr),
        this.getImage(sceneId, scene.bands.get(scene.greenBand), scene.hasOvr),
        this.getImage(sceneId, scene.bands.get(scene.blueBand), scene.hasOvr),
      ]);

      redImage.baseUrl = scene.bands.get(scene.redBand);
      greenImage.baseUrl = scene.bands.get(scene.greenBand);
      blueImage.baseUrl = scene.bands.get(scene.blueBand);

      const [redArr, greenArr, blueArr] = await all([redImage, greenImage, blueImage].map(
        tiff => this.getRawTile(tiff, tiff.baseUrl, z, x, y),
      ));

      const { width, height } = redArr;
      canvas.width = width;
      canvas.height = height;

      console.time(`rendering ${sceneId + z + x + y}`);
      const [red, green, blue] = [redArr, greenArr, blueArr].map(arr => arr[0]);
      renderData(canvas, scene.pipeline, width, height, red, green, blue, false);
      console.timeEnd(`rendering ${sceneId + z + x + y}`);
    }
  }
}
/* eslint-enable no-console */

export default CogAdapter;
