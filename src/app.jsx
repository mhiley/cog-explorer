import React, { Component } from 'react';
import { connect } from 'react-redux';
import { hot } from 'react-hot-loader'

import AddSceneForm from './components/scenes/add';
import ListScenes from './components/scenes/list';
import SceneDetails from './components/scenes/details';
import MapView from './components/mapview';

import { setError, addSceneFromIndex } from './actions/scenes';

import io from 'socket.io-client';

const mapStateToProps = ({ scenes, main }) => ({ scenes, ...main });
const mapDispatchToProps = (dispatch) => {
  return {
    addSceneFromIndex: (...args) => dispatch(addSceneFromIndex(...args)),
    setError: (...args) => dispatch(setError(...args)),
  };
};

class ConnectedApp extends Component {
  constructor() {
    super();
    this.state = {
      currentSceneId: null,
      showList: false,
    };

    this.handleSceneShowClicked = this.handleSceneShowClicked.bind(this);
  }

  handleSceneShowClicked(id = null) {
    this.setState({ currentSceneId: id });
  }

  componentDidMount() {
    const pathName = window.location.pathname;
    // UUID regex
    const sessionRe = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
    const matches = sessionRe.exec(pathName);

    if (matches) {
      const sessionId = matches[0];
      console.log(`determined session id ${sessionId}`);
      const socket = io();
      socket.emit('session', sessionId);
      console.log('initialized socket, ', socket);

      socket.on('map', (msg) => {
        const msgobj = JSON.parse(msg);
        console.log(msgobj);

        if (msgobj.command === 'update') {
          const urlToGeotiff = msgobj.data;
          this.props.addSceneFromIndex(urlToGeotiff);
        }
      });
    } else {
      console.log(`could not determine session id from ${pathName}`);
    }
  }

  render() {
    const { currentSceneId, showList } = this.state;
    const { scenes, isLoading, tilesLoading, longitude, latitude, zoom, errorMessage } = this.props;
    const scene = scenes[0];
    const pipelineStr = scene ? scene.pipeline.map((step) => {
      switch (step.operation) {
        case 'sigmoidal-contrast':
          return `sigmoidal(${step.bands || 'all'},${step.contrast},${step.bias})`;
        case 'gamma':
          return `gamma(${step.bands || 'all'},${step.value})`;
        default:
          return '';
      }
    }).join(';') : '';

    const bands = scene && !scene.isRGB ? [scene.redBand, scene.greenBand, scene.blueBand].join(',') : '';

    window.location.hash = `#long=${longitude.toFixed(3)}&lat=${latitude.toFixed(3)}&zoom=${Math.round(zoom)}&scene=${scene ? scene.id : ''}&bands=${bands}&pipeline=${pipelineStr}`;

    return (
      <div>
        <nav className="navbar navbar-expand-lg navbar-light bg-light">
          <div className="container-fluid">
            <div className="navbar-header">
              <span className="navbar-brand" style={{ color: 'white' }}>
                Syncarto
              </span>
              {
                errorMessage &&
                <div
                  className="alert alert-warning fade show"
                  role="alert"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '90px',
                    padding: '5px 4rem 5px 5px',
                  }}
                >{errorMessage}
                  <button type="button" className="close" aria-label="Close" style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    padding: '5px',
                  }} onClick={() => this.props.setError()}>
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
              }
              <i
                className="navbar-brand fas fa-spin fa-cog text-light"
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '50px',
                  visibility: (isLoading || tilesLoading > 0) ? 'visible' : 'hidden',
                  zIndex: 99,
                }}
              />
            </div>
          </div>
        </nav>

        <div
          style={{
            position: 'absolute',
            top: '58px',
            right: '8px',
            maxWidth: 'calc(100% - 58px)',
            zIndex: 50,
          }}
        >
          <form className="form-inline my-lg-0">
            <AddSceneForm />
            {/* <input class="form-control mr-sm-2" type="search" placeholder="Search" aria-label="Search" />
            <button class="btn btn-outline-success my-2 my-sm-0" type="submit">Search</button> */}
          </form>
        </div>

        <div style={{ height: 'calc(100% - 50px)' }}>
          <MapView />
        </div>
        <div className="container">
          <button
            className="btn btn-large"
            style={{
              position: 'absolute',
              top: '10px',
              right: '8px',
            }}
            onClick={() => this.setState({ showList: !showList })}
            disabled={scenes.length === 0}
          >
            <i className="fas fa-wrench" />
          </button>
          {
            showList && scenes.length > 0 &&
            <div
              className="card card-body"
              style={{
                position: 'absolute',
                top: '10px',
                right: '60px',
                maxWidth: 'calc(100% - 108px)',
                maxHeight: 'calc(100% - 20px)',
                overflowY: 'scroll',
                zIndex: 100,
              }}
            >
              {/* { <ListScenes onSceneClicked={this.handleSceneShowClicked} /> } */}
              { scenes.length > 0 &&
                <SceneDetails id={scenes[0].id} onSceneHide={this.handleSceneShowClicked} />
              }
            </div>
          }
        </div>
      </div>
    );
  }
}

const App = hot(module)(connect(mapStateToProps, mapDispatchToProps)((ConnectedApp)));

export default App;
