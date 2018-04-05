// @flow
import React, { Fragment, Component } from 'react'
import { extendObservable, runInAction } from 'mobx'
import { observer, inject } from 'mobx-react'
import { Link } from 'react-router-dom'
import DevTools from 'mobx-react-devtools'
import {
  Grid,
  Row,
  Button,
  Col,
  ButtonToolbar,
  OverlayTrigger,
  Popover,
  DropdownButton,
  MenuItem
} from 'react-bootstrap'
import filesize from 'filesize'
import DownloadButton from '../components/DownloadButton'
import LoadingAnimation from '../components/LoadingAnimation'
import SaveAsFileModal from '../components/SaveAsFileModal'
import SaveAsInsightModal from '../components/SaveAsInsightModal'
import { API_HOST } from '../util/constants'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import { getStateUrl } from '../util/urlState'
import VizCard from '../components/VizCard'
import VizEmpty from '../components/VizEmpty'
import ResizableVegaLiteEmbed from '../components/ResizableVegaLiteEmbed'
import CopyField from '../components/CopyField'
import { createParams } from '../util/util'
import classes from './App.module.css'
import type { StoreType } from '../util/Store'

class App extends Component<{
  history: Object,
  location: Object,
  store: StoreType
}> {
  data: ?Array<Object>

  loading: boolean
  errorLoading: boolean
  bytesDownloaded: number

  saveModalOpen: false | 'insight' | 'file'

  constructor(props) {
    super(props)
    extendObservable(this, {
      // data: null,
      loading: true,
      errorLoading: false,
      saveModalOpen: false,
      bytesDownloaded: 0
    })

    if (this.props.store.hasValidParams) {
      this.fetchQuery()
    }
  }

  getQueryUrl() {
    const { store } = this.props
    return `${API_HOST}/v0/sql/${store.agentid}/${
      store.datasetid
    }?includeTableSchema=true`
  }

  fetchQuery = async () => {
    const { store } = this.props
    runInAction(() => {
      store.setFields([])
      this.data = null
      this.loading = true
    })
    const res = await fetch(this.getQueryUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${store.token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: createParams({ query: store.query }).toString()
    })
    if (!res.ok || !res.body) {
      runInAction(() => {
        this.loading = false
        this.errorLoading = true
      })
      return
    }

    const reader = res.body.getReader()
    const chunks = []

    while (true) {
      const result = await reader.read()
      if (result.done) {
        break
      }

      const chunk = result.value
      if (chunk == null) {
        throw Error('Empty chunk received during download')
      } else {
        chunks.push(chunk)
        this.bytesDownloaded += chunk.byteLength
      }
    }
    const blob = new Blob(chunks, { type: 'application/json' })
    const data = await new Response(blob).json()

    const [dschema, ...rows] = data
    runInAction(() => {
      store.setFields([
        ...dschema.fields.map(f => ({
          name: f.name,
          rdfType: f.rdfType
        })),
        {
          name: '*',
          label: 'COUNT(*)',
          rdfType: 'http://www.w3.org/2001/XMLSchema#integer'
        }
      ])
      this.data = rows
      this.loading = false
      if (this.props.store.config.encodings.length === 0) {
        this.props.store.reset()
      }
    })
  }

  vegaView: Object
  handleViewRender = v => {
    this.vegaView = v
  }

  renderShareOverlay() {
    return (
      <Popover id="popover-share-url" title="Share Link">
        <CopyField getValue={() => getStateUrl(this.props.store)} />
      </Popover>
    )
  }

  renderEmbed() {
    const { data } = this
    const { store } = this.props
    return (
      (data &&
        store.fields &&
        store.config.hasPossiblyValidChart && (
          <ResizableVegaLiteEmbed
            spec={store.config.generatedSpec}
            data={data}
            onViewRender={this.handleViewRender}
            setDimensions={store.config.setDimensions}
            showResize={
              !store.config.hasManualSpec && !store.config.hasFacetField
            }
          />
        )) || <VizEmpty />
    )
  }

  render() {
    const { store } = this.props

    if (!store.hasValidParams) {
      return (
        <Fragment>
          {process.env.NODE_ENV === 'development' && <DevTools />}
          <Header />
          <Grid style={{ marginTop: 32 }}>
            <Row>
              <Col xs={12}>
                <h3>Valid parameters required</h3>
                <Link
                  data-test="example-link"
                  to={{
                    pathname: '/',
                    search:
                      '?agentid=data-society&datasetid=iris-species&query=SELECT+%2A%0AFROM+iris'
                  }}
                >
                  Here's an example
                </Link>
              </Col>
            </Row>
          </Grid>
        </Fragment>
      )
    }

    if (this.loading || this.errorLoading) {
      return (
        <Fragment>
          {process.env.NODE_ENV === 'development' && <DevTools />}
          <Header />
          <Grid style={{ marginTop: 32 }}>
            {this.loading ? (
              <LoadingAnimation
                hideOverlay
                label={
                  'Downloading: ' +
                  (this.bytesDownloaded === 0
                    ? '...'
                    : filesize(this.bytesDownloaded, { round: 1 }))
                }
              />
            ) : (
              <h4>Error loading data</h4>
            )}
          </Grid>
        </Fragment>
      )
    }

    return (
      <Fragment>
        {process.env.NODE_ENV === 'development' && <DevTools />}
        <Header agentid={store.agentid} datasetid={store.datasetid} />

        <div className={classes.main}>
          <Sidebar />
          <div className={classes.embed}>
            <Grid fluid className={classes.topBar}>
              <Row>
                <Col xs={12} className={classes.topBarCol}>
                  <div className={classes.topBarHeader}>
                    <input
                      data-test="chart-title"
                      className={classes.topBarTitle}
                      placeholder="Untitled chart"
                      value={store.config.title || ''}
                      onChange={e => {
                        store.config.setTitle(e.target.value)
                      }}
                    />
                  </div>
                  <div className={classes.topBarButtons}>
                    <ButtonToolbar>
                      <OverlayTrigger
                        trigger="click"
                        rootClose
                        placement="bottom"
                        overlay={this.renderShareOverlay()}
                      >
                        <Button
                          data-test="share-btn"
                          bsSize="xs"
                          disabled={!store.config.hasPossiblyValidChart}
                        >
                          Share Link
                        </Button>
                      </OverlayTrigger>
                      <DownloadButton
                        getVegaView={() => this.vegaView}
                        getData={() => this.data}
                      />
                      <DropdownButton
                        bsSize="xs"
                        title="Save as..."
                        id="dropdown-save-ddw"
                        disabled={!store.config.hasPossiblyValidChart}
                        className={classes.dropdownButton}
                        pullRight
                        noCaret
                        onSelect={ek => (this.saveModalOpen = ek)}
                      >
                        <MenuItem header>data.world</MenuItem>
                        <MenuItem eventKey="file">File</MenuItem>
                        <MenuItem eventKey="insight">Insight</MenuItem>
                      </DropdownButton>
                    </ButtonToolbar>
                  </div>
                </Col>
              </Row>
            </Grid>
            <VizCard>{this.renderEmbed()}</VizCard>
          </div>
        </div>
        {this.saveModalOpen === 'insight' && (
          <SaveAsInsightModal
            onClose={() => (this.saveModalOpen = false)}
            defaultId={store.agentid + '/' + store.datasetid}
            data={this.data}
          />
        )}
        {this.saveModalOpen === 'file' && (
          <SaveAsFileModal
            onClose={() => (this.saveModalOpen = false)}
            defaultId={store.agentid + '/' + store.datasetid}
            data={this.data}
          />
        )}
      </Fragment>
    )
  }
}

export default inject('store')(observer(App))
