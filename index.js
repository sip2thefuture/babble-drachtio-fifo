
const events = require( "events" )
const assert = require('assert').strict

const domain = require( "./lib/domain.js" )

/**
Manage all of our fifos (queues), calls queueing and agents.
*/
class fifos {

  /**
  @param { object } options
  @param { object } options.srf - srf object
  @param { object } [ options.em ] - event emmitter
  @param { number } [ options.agentlag = 30000 ] - duration after last call to retry next new call (mS)
  */
  constructor( options ) {

    assert( !options.srf, "You must supply an srf object" )

    /**
    @private
    */
    this._options = options

    if( !this.options.em ) {
      this.options.em = new events.EventEmitter()
    }

    this.options.em.on( "call.destroyed", this._onentitymightbefree.bind( this ) )
    this.options.em.on( "register", this._onentitymightbeavailable.bind( this ) )

    this.options.em.on( "unregister", this._onentitymightbeunavailable.bind( this ) )
    this.options.em.on( "call.new", this._onentitybusy.bind( this ) )
    this.options.em.on( "call.authed", this._onentitybusy.bind( this ) )

    /**
    @private
    */
    this._domains = new Map()

    /**
    Each agent has the structure
    {
      "uri": "1000@dummy.com",
      "fifos": Set(),
      "state": "busy" - "busy|ringing|resting|available",
      "callcount": 0
    }
    The key is the uri
    @private
    */
    this._allagents = new Map()

    /**
    @private
    */
    this._agentlag = 30000
    if( options && options.agentlag ) this._agentlag = options.agentlag
  }

  /**
  Trigger a call from the next most important queue (based on oldest next)
  */
  _callagents( agentinfo ) {
    let orderedfifos = Array.from( agentinfo.fifos )

    /* oldest first */
    orderedfifos.sort( ( a, b ) => { return b.age - a.age } )
    orderedfifos[ 0 ]._callagents()
  }

  /**
  Called by callmanager event emitter
  @param { call } call - our call object
  @private 
  */
  async _onentitymightbefree( call ) {
    let entity = await call.entity
    if( entity && 0 === entity.ccc ) {
      /* We know who it is and they have no other calls */
      if( this._allagents.has( entity.uri ) ) {
        let agent = this._allagents.get( entity.uri )
        if( "busy" === agent.state ) {
          agent.state = "resting"
          setTimeout( () => {
            agent.state = "available"
            this._callagents( agent )
          }, this._agentlag )
        }
      }
    }
  }

  async _onentitymightbeavailable( reginfo ) {
    if( this._allagents.has( reginfo.auth.uri ) ) {
    }
  }

  async _onentitymightbeunavailable( reginfo ) {
    if( this._allagents.has( reginfo.auth.uri ) ) {
    }
  }

  /**
  Called by callmanager event emitter
  @param { call } call - our call object
  @private 
  */
  async _onentitybusy( call ) {
    let entity = await call.entity
    if( entity && entity.ccc > 0 ) {
      if( this._allagents.has( entity.uri ) ) {
        this._allagents.get( entity.uri ).state = "busy"
      }
    }
  }

  /**
  Queue a call with options
  @param { object } options
  @param { call } options.call
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { number } [ options.timeout = 3600 ] - the max time to hold the call in the queue
  @param { number } [ options.priority = 5 ] - the priority - 1-10 - the lower the higher the priority
  @param { string } [ options.mode = "ringall" ] - or "enterprise"
  @returns { Promise } - resolves when answered or fails.
  */
  async queue( options ) {
    let d = this._getdomain( options.domain )
    if( d ) await d.queue( options )
  }

  /**
  Sets the members of a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { array.< string > } options.agents - array of agents i.e. [ "1000@dummy.com" ]
  */
  addagents( options ) {
    let d = this._getdomain( options.domain )
    if( d ) d.agents( options )

    for( let agent of options.agents ) {
      this.addagent( {
        "name": options.name,
        "domain": options.domain,
        agent
      } )
    }
  }

  /**
  Sets the members of a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { string } options.agent - agent i.e. "1000@dummy.com"
  */
  addagent( options ) {
    if( !options.agent ) return

    let d = this._getdomain( options.domain )

    let ouragent

    if( this._allagents.has( options.agent ) ) {
      ouragent = this._allagents.get( options.agent )
      d.addagent( options, ouragent )
    } else {
      ouragent = {
        "uri": options.agent,
        "fifos": new Set(),
        "state": "available"
      }

      this._allagents.set( options.agent, ouragent )

      if( !d.addagent( options, ouragent ) ) {
        /* this shouldn't happen */
        this._allagents.delete( options.agent )
      }
    }
  }

  /**
  Create or return a domain object containing a domains fifos.
  @private
  @param { string } domainname
  @return { domain }
  */
  _getdomain( domainname ) {

    if( this._domains.has( domainname ) ) {
      return this._domains.get( domainname )
    }

    let newdomain = domain.create()
    this._domains.set( domainname, newdomain )
    return newdomain
  }

  /**
  Shortcut to create fifos.
  */
  static create( options ) {
    return new fifos( options )
  }
}


module.exports = fifos
