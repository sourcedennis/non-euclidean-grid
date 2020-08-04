/*
 * This file contains the operations for rendering a Non-Euclidean 2-Dimensional
 * grid. (See the Demo referenced in the README.md)
 * 
 * Note
 * - The entry point of execution is the 'DOMContentLoaded' listener at the very
 *   bottom
 * - The rendering is (inherently) complicated, please see my blog post
 *   explaining it (referenced in README.md)
 * - If you insist on understanding the code, these are probably the most
 *   important:
 *   render(..), renderCardinal(..), renderIntercardinal(..), renderAlongEdge(..)
 */


/** Represents optional values */
type Maybe< T > = T | undefined;

/** A simple _immutable_ two-dimensional vector */
class Vec2 {
  public readonly x : number;
  public readonly y : number;

  public constructor( x : number, y : number ) {
    this.x = x;
    this.y = y;
  }

  /** Produces a new vector that is the sum of 'this' and 'v' */
  public add( v : Vec2 ): Vec2 {
    return new Vec2( this.x + v.x, this.y + v.y );
  }

  /** Produces a new vector that is 'this' multiplied with the scalar 'm' */
  public mul( m : number ): Vec2 {
    return new Vec2( this.x * m, this.y * m );
  }

  /** Produces a new equally oriented vector of length 1 */
  public normalize( ): Vec2 {
    let len = Math.sqrt( this.x * this.x + this.y * this.y );
    return new Vec2( this.x / len, this.y / len );
  }

  /** Produces a new vector of equal length that is rotated by 'angle' */
  public rotate( angle : number ): Vec2 {
    const cs = Math.cos( angle );
    const sn = Math.sin( angle );
    return new Vec2( this.x * cs - this.y * sn
                   , this.x * sn + this.y * cs );
  }

  /** Returns the angle (in radians) between this vector and the produced vector */
  public angle( b : Vec2 ): number {
    let angle = Math.atan2( b.y, b.x ) - Math.atan2( this.y, this.x );
    if ( angle > Math.PI ) {
      angle -= 2 * Math.PI;
    } else if ( angle <= -Math.PI ) {
      angle += 2 * Math.PI;
    }
    return angle;
  }
}

/** Cardinal Direction */
enum CDir {
  NORTH = 0, EAST, SOUTH, WEST
}

namespace CDir {
  /** Interprets the directions as angles and adds them together. North is 0.
   *  E.g., adding East (90deg) to South (180deg), it results in West (270deg).
   */
  export function add( a : CDir, b : CDir ): CDir {
    return ( a + b ) % 4;
  }

  /** Interprets the directions as angles and subtracts them. North is 0.
   *  E.g., subtracting South (180deg) from West (270deg), produces East (90deg).
   */
  export function sub( a : CDir, b : CDir ): CDir {
    return ( a - b + 4 ) % 4;
  }

  /** Returns the angle in radians. North is 0. */
  export function angle( d : CDir ): number {
    switch ( d ) {
      case CDir.NORTH: return 0;
      case CDir.EAST:  return Math.PI * 0.5;
      case CDir.SOUTH: return Math.PI;
      case CDir.WEST:  return Math.PI * 1.5;
    }
  }

  /** Returns a unit vector pointing in the cardinal direction */
  export function vec( d : CDir ): Vec2 {
    switch ( d ) {
      case CDir.NORTH: return new Vec2(  0,  1 );
      case CDir.EAST:  return new Vec2(  1,  0 );
      case CDir.SOUTH: return new Vec2(  0, -1 );
      case CDir.WEST:  return new Vec2( -1,  0 );
    }
  }

  /** Returns 'true' if 'a' is immediately left of 'b'.
   *  E.g., North is immediately left of East.
   */
  export function isLeftOf( a : CDir, b : CDir ): boolean {
    return sub( b, a ) == 1;
  }
}

/** An unoriented tile. (So, think of it as pointing North in tile-space, but
 *  without orientation in world-space; If that makes sense?)
 */
class Tile {
  /** The text that is rendered at the center of the tile */
  public readonly text : string;

  /** The tile located at the north face (in tile-space) of this tile */
  public north : Maybe< DirectedTile >;
  /** The tile located at the east face (in tile-space) of this tile */
  public east  : Maybe< DirectedTile >;
  /** The tile located at the south face (in tile-space) of this tile */
  public south : Maybe< DirectedTile >;
  /** The tile located at the west face (in tile-space) of this tile */
  public west  : Maybe< DirectedTile >;

  /** Constructs a new tile with a text. It has _no_ adjacent tiles yet. */
  public constructor( text : string ) {
    this.text = text;
  }

  /** Connects a tile to the face located at the 'dir' direction (in tile-space)
   *  Warning: This does _not_ mutually connect the tiles. (See `linkTiles(..)`)
   */
  public setAdjacent( dir: CDir, t : Maybe< DirectedTile > ) {
    switch ( dir ) {
      case CDir.NORTH: this.north = t; break;
      case CDir.EAST:  this.east  = t; break;
      case CDir.SOUTH: this.south = t; break;
      case CDir.WEST:  this.west  = t; break;
    }
  }

  /** Returns the face located at the 'dir' direction (in tile-space) */
  public getAdjacent( dir : CDir ): Maybe< DirectedTile > {
    switch ( dir ) {
      case CDir.NORTH: return this.north;
      case CDir.EAST:  return this.east;
      case CDir.SOUTH: return this.south;
      case CDir.WEST:  return this.west;
    }
  }
}

/** A tile with a _relative position_ to another tile.
 *  E.g., Two adjacent tile with equal orientation have North as their relative
 *  orientations.
 *  When 'A' is the root with 'B' at its East side ( ^A^ <B ) where B's North
 *  face points in the direction of A's west, then B is oriented West.
 *  'A' is oriented East from B's perspective (its North face points to B's East)
*/
class DirectedTile {
  /** The orientation of the tile from the connect tile's perspective
   *  Think of this as the direction the north face points in world-space.
   */
  public readonly orientation : CDir;
  /** The undirected tile */
  public readonly tile        : Tile;

  /** Constructs a new directed tile */
  public constructor( orientation : CDir, tile : Tile ) {
    this.orientation = orientation;
    this.tile        = tile;
  }

  /** Returns the tile adjacent in direction 'dir' in world-space */
  public getAdjacent( dir : CDir ): Maybe< DirectedTile > {
    // orientation in this.tile's tile-space
    const adjTileOrientation = CDir.sub( dir, this.orientation );
    const adjTile = this.tile.getAdjacent( adjTileOrientation );
    if ( adjTile ) {
      return new DirectedTile(
               CDir.add( this.orientation, adjTile.orientation ),
               adjTile.tile
             );
    } else {
      return undefined;
    }
  }

  /** Returns true if 'this' tile equally represents the same tile in
   *  world-space as 'other'
   */
  public equals( other : DirectedTile ): boolean {
    return this.orientation === other.orientation && this.tile === other.tile;
  }
}

/** An _immutable_ configuration that is passed along in the render process.
 *  It mainly captures the clip-region within which rendering should take place.
 *  It is immutable and copies-on-update to ensure previous clip-regions are not
 *  lost.
 */
class RenderConfig {
  /** Width of the render canvas */
  public readonly width      : number;
  /** Height of the render canvas */
  public readonly height     : number;
  /** The region within which rendering should take place. When 'undefined'
   *  rendering may be performed on the entire screen. See 'ClipRegion'.
   */
  public readonly clipRegion  : Maybe< ClipRegion >;

  /** Constructs a new render configuration */
  public constructor( width : number, height : number, clipRegion? : ClipRegion ) {
    this.width      = width;
    this.height     = height;
    this.clipRegion = clipRegion;
  }

  /** Produces a 'RenderConfig' whose upper half-line is updated, but _only if
   *  it makes the region smaller_. If this makes the clip region empty (i.e.
   *  representing no pixels), 'undefined' is returned.
   */
  public clipUpper( v : Vec2 ): Maybe< RenderConfig > {
    if ( this.clipRegion ) {
      const s = this.clipRegion.clip1( v );
      return s ? new RenderConfig( this.width, this.height, s ) : undefined;
    } else {
      throw new Error( 'Clipping disabled' ); // Use `#clip(..)` first
    }
  }

  /** Produces a 'RenderConfig' whose lower half-line is updated, but _only if
   *  it makes the region smaller_. If this makes the clip region empty (i.e.
   *  representing no pixels), 'undefined' is returned.
   */
  public clipLower( v : Vec2 ): Maybe< RenderConfig > {
    if ( this.clipRegion ) {
      const s = this.clipRegion.clip2( v );
      return s ? new RenderConfig( this.width, this.height, s ) : undefined;
    } else {
      throw new Error( 'Clipping disabled' ); // Use `#clip(..)` first
    }
  }

  /** Produces a 'RenderConfig' with a fresh clip region */
  public beginClip( vUpper : Vec2, vLower : Vec2 ): RenderConfig {
    return new RenderConfig( this.width,  this.height, new ClipRegion( vUpper, vLower ) );
  }

  /** Applies the clip region to the provided 'CanvasRenderingContext2D' */
  public applyClip( ctx : CanvasRenderingContext2D ): void {
    if ( this.clipRegion ) {
      const hsw = Math.floor( this.width / 2 );  // half screen width
      const hsh = Math.floor( this.height / 2 ); // half screen height

      const v1 = this.clipRegion.vUpper;
      const v2 = this.clipRegion.vLower;
      
      // The scale such that the clip half-lines reach the screen edges
      const sc =
        Math.ceil(
          Math.max(
            Math.min( Math.abs( hsw / v1.x ), Math.abs( hsh / v1.y ) ),
            Math.min( Math.abs( hsw / v2.x ), Math.abs( hsh / v2.y ) )
          )
        );

      const p = new Path2D();
      p.moveTo( 0, 0 ); // Note that (0,0) is the _center_ of the screen
      p.lineTo( sc * v1.x, - sc * v1.y );
      p.lineTo( sc * (v1.x + v2.x), - sc * (v1.y + v2.y) );
      p.lineTo( sc * v2.x, - sc * v2.y );
      p.closePath( );

      ctx.clip( p );
    }
  }

  /** Returns the tile size appropriate for the current canvas size */
  public tileSize( ): number {
    // At least 12 tiles must fit along both axes
    return Math.floor( Math.min( this.width, this.height ) / 12 );
  }
}

/** A clip region bounded by two half-lines. The angle between 'vUpper' and
 *  'vLower' must be in the range [0, PI).
 *  E.g., note that the angle between North=(0,1) and East=(1,0) is 0.5*PI.
 *  That is okay. The angle between East and North, however, is -0.5*PI;
 *  which is _not_ okay. (As North should be 'vUpper' and East 'vLower')
 */
class ClipRegion {
  /** The upper half-line of the clip region. Originated at (0,0) */
  public readonly vUpper : Vec2;
  /** The upper half-line of the clip region. Originated at (0,0) */
  public readonly vLower : Vec2;

  /* Constructs a new clip region */
  public constructor( vUpper : Vec2, vLower : Vec2 ) {
    this.vUpper = vUpper;
    this.vLower = vLower;
  }

  /** Produces a 'ClipRegion' whose upper half-line is updated, but _only if
   *  it makes the region smaller_. If this makes the clip region empty (i.e.
   *  representing no pixels), 'undefined' is returned.
   */
  public clip1( v : Vec2 ): Maybe< ClipRegion > {
    if ( v.angle( this.vUpper ) > 0 ) { // it is smaller
      if ( this.vLower.angle( v ) > 0 ) {
        return new ClipRegion( v, this.vLower );
      } else { // it's so small, the clip space became empty
        return undefined;
      }
    } else { // clipping with 'v' does _not_ make it smaller, so ignore
      return this;
    }
  }

  /** Produces a 'ClipRegion' whose lower half-line is updated, but _only if
   *  it makes the region smaller_. If this makes the clip region empty (i.e.
   *  representing no pixels), 'undefined' is returned.
   */
  public clip2( v : Vec2 ): Maybe< ClipRegion > {
    if ( v.angle( this.vLower ) < 0 ) { // it is smaller
      if ( v.angle( this.vUpper ) > 0 ) {
        return new ClipRegion( this.vUpper, v );
      } else { // it's so small, the clip space became empty
        return undefined;
      }
    } else { // clipping with 'v' does _not_ make it smaller, so ignore
      return this;
    }
  }
}

/** Vertical direction (Used for movement) */
enum VDir {
  UP, DOWN, NONE
}

/** Horizontal direction (Used for movement) */
enum HDir {
  LEFT, RIGHT, NONE
}

/** Rotation direction (Used for movement) */
enum RotDir {
  LEFT, RIGHT, NONE
}

/** Mutually connects two tiles. Connect the face of 'a' pointing to 'aLoc' to
 *  the face of 'b' pointing to 'bLoc'
 */
function linkTiles( a : Tile, b : Tile, aLoc : CDir, bLoc : CDir ) {
  a.setAdjacent( aLoc, new DirectedTile( CDir.add( CDir.sub( aLoc, bLoc ), CDir.SOUTH ), b ) );
  b.setAdjacent( bLoc, new DirectedTile( CDir.add( CDir.sub( bLoc, aLoc ), CDir.SOUTH ), a ) );
}

/** Returns 'true' only if the region [a1,a2] overlaps with the region [b1,b2].
 *  The size of the overlapping region must be _strictly larger_ than 0.
 */
function overlaps( a1 : number, a2 : number, b1 : number, b2 : number ): boolean {
  return a1 <= b2 && b1 <= a2;
}

/** Returns 'true' only if the tile centered at 'loc' is within the screen space */
function isTileVisible( cfg: RenderConfig, loc: Vec2 ): boolean {
  let ts  = cfg.tileSize( ); // tile size
  let hts = Math.floor( ts / 2 ); // half tile size
  let hsw = Math.floor( cfg.width / 2 ); // half screen width
  let hsh = Math.floor( cfg.height / 2 ); // half screen height

  // the tile is placed at [x*ts-hts, x*ts+hts]x[y*ts-hts, y*ts+hts]
  // the world is sized [-hsw, hsw]x[-hsh, hsh]. If they don't overlap, it's not visible
  return overlaps( loc.x*ts-hts, loc.x*ts+hts, -hsw, hsw ) && overlaps( loc.y*ts-hts, loc.y*ts+hts, -hsh, hsh );
}

/** Draws a line segment from 'v' to the edge of the screen. The direction is
 *  equal to that of the line from (0,0) to 'v'.
 *  Think of it like shooting a ray from (0,0) through 'v' until the edge of the
 *  screen. (But without rendering the (0,0)-to-'v' part)
 */
function renderLineToEdge( ctx : CanvasRenderingContext2D, cfg : RenderConfig, v : Vec2 ): void {
  let ts  = cfg.tileSize( ); // tile size
  let hsw = Math.floor( cfg.width / 2 ); // half screen width
  let hsh = Math.floor( cfg.height / 2 ); // half screen height
  
  ctx.strokeStyle = 'green';
  ctx.lineWidth = Math.ceil( ts / 60 ); // make line wider on bigger screens
  ctx.beginPath( );
  ctx.moveTo( ts * v.x, - ts * v.y );
  // Scale. The necessary multiplier to reach at least the edge of the screen.
  let sc = Math.ceil( Math.min( Math.abs( hsw / v.x ), Math.abs( hsh / v.y ) ) );
  ctx.lineTo( ts * v.x * sc, - ts * v.y * sc );
  ctx.stroke( );
}

/** Renders a directed tile (whose orientation is in world-space) at tile
 *  location 'loc'. Note that the location is multiplied by the tile-size.
 */
function renderTile( ctx : CanvasRenderingContext2D, cfg: RenderConfig, tile : DirectedTile, loc : Vec2 ): void {
  let hts = Math.round( cfg.tileSize( ) / 2 ); // half tile size
  let ts  = hts * 2; // tile size

  // Move to the world-space location of the tile's top-left corner (in tile-space)
  let topLeft: Vec2;
  switch ( tile.orientation ) {
    case CDir.NORTH: topLeft = new Vec2( -hts, -hts ); break;
    case CDir.EAST:  topLeft = new Vec2(  hts, -hts ); break;
    case CDir.SOUTH: topLeft = new Vec2(  hts,  hts ); break;
    case CDir.WEST:  topLeft = new Vec2( -hts,  hts ); break;
  }

  ctx.save( ); // save(1)
  cfg.applyClip( ctx );

  // Render the tile background and border. These do not require rotation.
  // Rotating these may misaligns them by 1 pixel, which looks weird.
  ctx.save( ); // save(2)
  ctx.translate( Math.round( loc.x * ts - hts ), Math.round( -loc.y * ts - hts ) );
  ctx.fillStyle = 'white';
  ctx.fillRect( 0, 0, ts, ts );
  ctx.strokeStyle = 'blue';
  ctx.strokeRect( 0.5, 0.5, ts, ts );
  ctx.restore( ); // restore(2)

  // Render the tile background and border. These ought to be properly rotated
  // from the tile's top-left corner.
  ctx.save( ); // save(3)
  ctx.translate( Math.round( loc.x * ts + topLeft.x ), Math.round( -loc.y * ts + topLeft.y ) );
  ctx.rotate( CDir.angle( tile.orientation ) );
  let px = Math.floor( ts * 0.6 );
  ctx.font = `${px}px Roboto Light`;
  ctx.fillStyle = 'red';
  ctx.fillText( tile.tile.text, ts / 2 - ctx.measureText( tile.tile.text ).width / 2, ts / 2 + px * 0.4 );
  ctx.restore( ); // restore(3)
  
  ctx.restore( ); // restore(1)
}

/** Renders all tiles in the direction 'dir' beyond 'tile'. 'loc' is the
 *  location of 'tile', but 'tile' itself is _not_ rendered by this function. */
function renderCardinal( ctx : CanvasRenderingContext2D, cfg: RenderConfig, dir : CDir, tile : DirectedTile, loc: Vec2 ) {
  let adjTile = tile.getAdjacent( dir );
  if ( adjTile ) {
    let adjLoc = loc.add( CDir.vec( dir ) );
    if ( isTileVisible( cfg, loc ) ) {
      renderTile( ctx, cfg, adjTile, adjLoc );
      renderCardinal( ctx, cfg, dir, adjTile, adjLoc );
    }
  }
}

/** Renders the entire intercardinal quadrant in the direction intercardinal
 *  direction between 'dir1' and 'dir2' beyond 'tile'. 'loc' is the location of
 *  'tile', but 'tile' itself is _not_ rendered.
 * 
 *  So, for some tile A, if 'dir1=North' and 'dir2=East', the tile north-east
 *  of A is rendered. This takes into account non-euclidean splits.
 *  
 *  Warning: dir1 must be left of dir2 (See CDir#isLeftOf(..))
 */
function renderIntercardinal( ctx : CanvasRenderingContext2D, cfg: RenderConfig, dir1 : CDir, dir2 : CDir, tile : DirectedTile, loc : Vec2 ) {
  const d1V = CDir.vec( dir1 );
  const d2V = CDir.vec( dir2 );

  // There are two cases. Either there is an intercardinal split, or there is
  // not. That is, for example, if tiles->North->East != tile->East->North.

  if ( hasIntercardinalSplit( tile, dir1, dir2 ) ) {
    // As there is an intercardinal split, both subregions of the quadrant have
    // to be rendered individually. Both these regions have (mutually exclusive)
    // clip regions.

    const clipLine = loc.add( d1V.add( d2V ).mul( 0.5 ) );

    // Render the sub-quadrant in the direction of 'dir1'. Note that it's lower
    // side is bounded by the 'clipLine'.
    let d1Adj = tile.getAdjacent( dir1 );
    if ( d1Adj ) { // Otherwise it's a black void
      let cfg2 = cfg.clipLower( clipLine );
      if ( cfg2 ) { // Otherwise the clip region is empty
        renderCardinal( ctx, cfg2, dir2, d1Adj, loc.add( d1V ) );
        renderIntercardinal( ctx, cfg2, dir1, dir2, d1Adj, loc.add( d1V ) );
      }
    }

    // Render the sub-quadrant in the direction of 'dir2'. Note that it's upper
    // side is bounded by the 'clipLine'.
    let d2Adj = tile.getAdjacent( dir2 );
    if ( d2Adj ) { // Otherwise it's a black void
      let cfg2 = cfg.clipUpper( clipLine );
      if ( cfg2 ) { // Otherwise the clip region is empty
        renderCardinal( ctx, cfg2, dir1, d2Adj, loc.add( d2V ) );
        renderIntercardinal( ctx, cfg2, dir1, dir2, d2Adj, loc.add( d2V ) );
      }
    }
    
    // Render the green clip line. Note that this must be clipped within the
    // clipped within the clip region provided by the caller. Otherwise clip-
    // lines are rendered within areas where no tiles are rendered.
    ctx.save( );
    cfg.applyClip( ctx );
    renderLineToEdge( ctx, cfg, clipLine );
    ctx.restore( );
  } else { // No intercardinal split
    // There could be tiles that "hang off" the 'dir1' and 'dir2' axes. That is,
    // 'tile->dir1->dir2->dir1(*n)' may not reach the same tile as
    // 'tile->dir1->dir1(*n)->dir2'. The latter thus "hangs off" the 'dir1' axis
    // extending from 'tile'. These "hanging" regions are first rendered within
    // their own clip region. The clipped regions obtained from this are then
    // inverted to render the remainder of the quadrant.

    let split1: Maybe< Vec2 >, split2 : Maybe< Vec2 >;

    // Render the "hanging off" the 'dir1' axis
    let d1Adj = tile.getAdjacent( dir1 );
    if ( d1Adj ) {
      split1 = renderAlongEdge( ctx, cfg, dir1, dir2, d1Adj, loc.add( CDir.vec( dir1 ) ) );
    }

    // Render the "hanging off" the 'dir2' axis
    let d2Adj = tile.getAdjacent( dir2 );
    if ( d2Adj ) {
      split2 = renderAlongEdge( ctx, cfg, dir2, dir1, d2Adj, loc.add( CDir.vec( dir2 ) ) );
    }

    // Now render the "body" of the quadrant starting with 'tile->dir1->dir2'. It
    // is rendered within the regions delimited by the "hanging" tiles.
    if ( d1Adj ) {
      let d1d2Adj = d1Adj.getAdjacent( dir2 );
      if ( d1d2Adj ) {
        const cfg2 = ( split1 ? cfg.clipUpper( split1 ) : cfg );
        const cfg3 = ( split2 ? cfg2?.clipLower( split2 ) : cfg2 );
        if ( cfg3 ) {
          renderTile( ctx, cfg3, d1d2Adj, loc.add( d1V.add( d2V ) ) );
          renderCardinal( ctx, cfg3, dir1, d1d2Adj, loc.add( d1V.add( d2V ) ) );
          renderCardinal( ctx, cfg3, dir2, d1d2Adj, loc.add( d1V.add( d2V ) ) );
          renderIntercardinal( ctx, cfg3, dir1, dir2, d1d2Adj, loc.add( d1V.add( d2V ) ) );
        }
      }
    }

    // Finally render the green clip lines (if applicable)
    ctx.save( );
    cfg.applyClip( ctx );

    if ( split1 ) {
      renderLineToEdge( ctx, cfg, split1 );
    }

    if ( split2 ) {
      renderLineToEdge( ctx, cfg, split2 );
    }

    ctx.restore( );
  }
}

/** This renders tiles "hanging" off the 'dirMain' axis.
 * 
 *  'tile->dir1->dir2->dir1(*n)' may not reach the same tile as
 *  'tile->dir1->dir1(*n)->dir2'. The latter can be considered as "hanging off"
 *  the row of tiles in the axis of 'dir1'.
 */
function renderAlongEdge( ctx : CanvasRenderingContext2D, cfg: RenderConfig, dirMain : CDir, dirSnd : CDir, tile : DirectedTile, loc : Vec2 ): Maybe< Vec2 > {
  if ( !isTileVisible( cfg, loc ) )
    return undefined;

  const dirMainV = CDir.vec( dirMain );
  const dirSndV  = CDir.vec( dirSnd );

  if ( hasIntercardinalSplit( tile, dirMain, dirSnd ) ) {
    // As an intercardinal split is present, it means several tiles "hang" off
    // the tiles along the main axis. Render these hanging tiles, and return the
    // clip half-line.

    const clipLine = loc.add( dirMainV.add( dirSndV ).mul( 0.5 ) );

    const d1Adj = tile.getAdjacent( dirMain );
    if ( d1Adj ) {
      // Either the clip line is at the bottom of the main axis, or at the top.
      // This depends on the parameter order. Handle these cases individually.

      if ( CDir.isLeftOf( dirMain, dirSnd ) ) {
        const cfg2 = cfg.clipLower( clipLine );
        if ( cfg2 ) {
          renderCardinal( ctx, cfg2, dirSnd, d1Adj, loc.add( dirMainV ) );
          renderIntercardinal( ctx, cfg2, dirMain, dirSnd, d1Adj, loc.add( dirMainV ) );
        }
      } else {
        const cfg2 = cfg.clipUpper( clipLine );
        if ( cfg2 ) {
          renderCardinal( ctx, cfg2, dirSnd, d1Adj, loc.add( dirMainV ) );
          renderIntercardinal( ctx, cfg2, dirSnd, dirMain, d1Adj, loc.add( dirMainV ) );
        }
      }
    }
    return clipLine;
  } else {
    // If it has no intercardinal split, it will be handled by the caller which
    // calls `renderCardinal(..., dirMain, ...)` for the tile. So don't render
    // it here. Only render things that are "behind" a project line.
    let d1Adj = tile.getAdjacent( dirMain );
    if ( d1Adj ) {
      return renderAlongEdge( ctx, cfg, dirMain, dirSnd, d1Adj, loc.add( dirMainV ) );
    } else {
      return undefined;
    }
  }
}

/** Returns 'true' only if 'tile->dir1->dir2' != 'tile->dir2->dir3'.
 * 
 *  This effectively determines whether the euclidean property is _not_
 *  satisfied for the provided tile and intercardinal direction.
 */
function hasIntercardinalSplit( tile : DirectedTile, dir1 : CDir, dir2 : CDir ): boolean {
  const tileD1 = tile.getAdjacent( dir1 );
  const tileD2 = tile.getAdjacent( dir2 );
  const tileD1D2 = tileD1 ? tileD1.getAdjacent( dir2 ) : undefined;
  const tileD2D1 = tileD2 ? tileD2.getAdjacent( dir1 ) : undefined;
  return Boolean( tileD1D2 ) !== Boolean( tileD2D1 ) ||
         ( Boolean( tileD1D2 ) &&
           Boolean( tileD2D1 ) &&
           !( <DirectedTile> tileD1D2 ).equals( <DirectedTile> tileD2D1 ) );
}

/**
 * Renders the entire scene with 'root' being the central tile at which the
 * user's is located.
 * 
 * @param tileOffset An offset in [0,1]x[0x1] representing the location of the
 *   user on the root tile.
 */
function render( ctx : CanvasRenderingContext2D, cfg : RenderConfig, root : DirectedTile, tileOffset : Vec2, rot : number ): void {
  // Render the background
  ctx.fillStyle = 'black';
  ctx.fillRect( 0, 0, cfg.width, cfg.height );

  ctx.save( ); // save(1)

  // Make (0,0) the center of the screen
  ctx.translate( Math.floor( cfg.width / 2 ), Math.floor( cfg.height / 2 ) );

  ctx.save( ); // save(2)
  ctx.rotate( rot ); // Rotate for the user's camera (controlled with Q/E)

  let x = ( -tileOffset.x + 0.5 );
  let y = -tileOffset.y + 0.5;

  renderTile( ctx, cfg, root, new Vec2( x, y ) );

  renderCardinal( ctx, cfg, CDir.NORTH, root, new Vec2( x, y ) );
  renderCardinal( ctx, cfg, CDir.EAST,  root, new Vec2( x, y ) );
  renderCardinal( ctx, cfg, CDir.SOUTH, root, new Vec2( x, y ) );
  renderCardinal( ctx, cfg, CDir.WEST,  root, new Vec2( x, y ) );
  
  renderIntercardinal( ctx, cfg.beginClip( new Vec2(  0,  1 ), new Vec2(  1,  0 ) ), CDir.NORTH,  CDir.EAST, root, new Vec2( x, y ) );
  renderIntercardinal( ctx, cfg.beginClip( new Vec2(  1,  0 ), new Vec2(  0, -1 ) ),  CDir.EAST, CDir.SOUTH, root, new Vec2( x, y ) );
  renderIntercardinal( ctx, cfg.beginClip( new Vec2(  0, -1 ), new Vec2( -1,  0 ) ), CDir.SOUTH,  CDir.WEST, root, new Vec2( x, y ) );
  renderIntercardinal( ctx, cfg.beginClip( new Vec2( -1,  0 ), new Vec2(  0,  1 ) ),  CDir.WEST, CDir.NORTH, root, new Vec2( x, y ) );

  ctx.restore( ); // restore(2)

  // Render the blue "user dot" at the center of the screen
  ctx.fillStyle = 'blue';
  ctx.fillRect( -3, -3, 6, 6 );

  ctx.restore( ); // restore(1)
}

/** Constructs a example non-euclidean grid.
 * 
 *  It has the following layout:
 * 
 *  t6    t7a/b  t8
 *  t3    t4     t5a/b 
 *  t0    t1     t2
 * 
 *  The `a` tiles are connected west, while the `b` tiles connect south.
 *  Additionally, t1 connects to t5b and t3 connects to t7b. This enforces the
 *  "infinitely looping space".
 */
function buildWorld( ): Tile {
  const t0  = new Tile( '0'  );
  const t1  = new Tile( '1'  );
  const t2  = new Tile( '2'  );
  const t3  = new Tile( '3'  );
  const t4  = new Tile( '4'  );
  const t5a = new Tile( '5a' );
  const t5b = new Tile( '5b' );
  const t6  = new Tile( '6'  );
  const t7a = new Tile( '7a' );
  const t7b = new Tile( '7b' );
  const t8  = new Tile( '8'  );

  // Horizontal links
  linkTiles( t0,  t1,  CDir.EAST,  CDir.WEST );
  linkTiles( t1,  t2,  CDir.EAST,  CDir.WEST );
  linkTiles( t3,  t4,  CDir.EAST,  CDir.WEST );
  linkTiles( t4, t5a,  CDir.EAST,  CDir.WEST );
  linkTiles( t6, t7a,  CDir.EAST,  CDir.WEST );
  linkTiles( t7b, t8,  CDir.EAST,  CDir.WEST );

  // Vertical links
  linkTiles( t0,  t3, CDir.NORTH, CDir.SOUTH );
  linkTiles( t3,  t6, CDir.NORTH, CDir.SOUTH );
  linkTiles( t1,  t4, CDir.NORTH, CDir.SOUTH );
  linkTiles( t4, t7b, CDir.NORTH, CDir.SOUTH );
  linkTiles( t2, t5b, CDir.NORTH, CDir.SOUTH );
  linkTiles( t5a, t8, CDir.NORTH, CDir.SOUTH );

  linkTiles( t1, t5b, CDir.SOUTH, CDir.EAST );
  linkTiles( t3, t7b, CDir.WEST,  CDir.NORTH );

  return t0;
}

/** Ensures the canvas stays full screen. Calls `f` upon update. */
function keepCanvasSize( canvas : HTMLCanvasElement, f: ( width: number, height: number ) => void ): void {
  // Note that the left side-panel is 320px in width

  window.addEventListener( 'resize', ev => {
    setTimeout( ( ) => { // Schedule it immediately
      canvas.width  = document.body.clientWidth - 320;
      canvas.height = document.body.clientHeight;
      f( canvas.width, canvas.height );
    }, 0 );
  } );

  setTimeout( ( ) => { // Schedule it immediately
    canvas.width  = document.body.clientWidth - 320;
    canvas.height = document.body.clientHeight;
    f( canvas.width, canvas.height );
  }, 0 );
}

/** Listens for key pressed that affect movement (Arrow keys, WASD/QE) and calls
 *  'f' with the movement direction obtained from this every 20ms. When no keys
 *  are pressed, 'f' is not called. (This avoids re-rendering the same frame)
 */
function observeKeyTick( f: ( v : VDir, h : HDir, r : RotDir, numSecs : number ) => void ): void {
  const TICK_DURATION = 20;

  let intervalStart = 0;
  let interval: Maybe< number > = undefined;
  let isUp = false, isRight = false, isDown = false, isLeft = false, isRotRight = false, isRotLeft = false;

  document.body.addEventListener( 'keydown', ev => {
    switch ( ev.keyCode ) {
      case 38 /* UP */:    case 87 /* W */: isUp    = true; break;
      case 39 /* RIGHT */: case 68 /* D */: isRight = true; break;
      case 40 /* DOWN */:  case 83 /* S */: isDown  = true; break;
      case 37 /* LEFT */:  case 65 /* A */: isLeft  = true; break;
      case 81 /* Q */: isRotRight = true; break;
      case 69 /* E */: isRotLeft  = true; break;
    }
    if ( typeof interval !== 'number' ) {
      intervalStart = Date.now( );
      interval = setInterval( ( ) => {
        const numTicks = Math.floor( ( Date.now( ) - intervalStart ) / TICK_DURATION );
        intervalStart += numTicks * TICK_DURATION;
        const v = isUp && !isDown ? VDir.UP : ( !isUp && isDown ? VDir.DOWN : VDir.NONE );
        const h = isRight && !isLeft ? HDir.RIGHT : ( !isRight && isLeft ? HDir.LEFT : HDir.NONE );
        const r = isRotRight && !isRotLeft ? RotDir.RIGHT : ( !isRotRight && isRotLeft ? RotDir.LEFT : RotDir.NONE );
        f( v, h, r, ( numTicks * TICK_DURATION ) / 1000 );
      }, TICK_DURATION );
    }
  } );
  document.body.addEventListener( 'keyup', ev => {
    switch ( ev.keyCode ) {
      case 38 /* UP */:    case 87 /* W */: isUp       = false; break;
      case 39 /* RIGHT */: case 68 /* D */: isRight    = false; break;
      case 40 /* DOWN */:  case 83 /* S */: isDown     = false; break;
      case 37 /* LEFT */:  case 65 /* A */: isLeft     = false; break;
      case 81 /* Q */: isRotRight = false; break;
      case 69 /* E */: isRotLeft  = false; break;
    }
    if ( !isUp && !isRight && !isDown && !isLeft && !isRotRight && !isRotLeft ) {
      clearInterval( interval );
      interval = undefined;
    }
  } );
}

// The entry point of the program. It configures listeners to keys for movement,
// and renders world whenever it updates.
document.addEventListener( 'DOMContentLoaded', ev => {
  const canvas = document.getElementsByTagName( 'canvas' )[ 0 ];
  const ctx = canvas.getContext( '2d' );
  
  if ( !ctx ) {
    const errorNode = <HTMLElement> document.getElementById( 'error2d' );
    errorNode.style.display = 'block';
  } else {
    // Ensures the canvas fill the remainder of the screen, and render on resize
    keepCanvasSize( canvas,
      ( w, h ) => render( ctx, new RenderConfig( w, h ), rootTile, camLoc, camRot ) );

    let rootTile = new DirectedTile( CDir.NORTH, buildWorld( ) );
    let camLoc = new Vec2( 0.5, 0.5 );
    let camRot = 0;
    
    observeKeyTick( ( v, h, r, numSecs ) => {
      switch ( v ) { // Vertical movement
        case VDir.UP:   camLoc = camLoc.add( new Vec2( 0,  3 * numSecs ).rotate( camRot ) ); break;
        case VDir.DOWN: camLoc = camLoc.add( new Vec2( 0, -3 * numSecs ).rotate( camRot ) ); break;
      }
      switch ( h ) { // Horizontal movement
        case HDir.LEFT:  camLoc = camLoc.add( new Vec2( -3 * numSecs, 0 ).rotate( camRot ) ); break;
        case HDir.RIGHT: camLoc = camLoc.add( new Vec2(  3 * numSecs, 0 ).rotate( camRot ) ); break;
      }
      switch ( r ) { // Rotation
        case RotDir.LEFT:  camRot -= 0.7 * Math.PI * numSecs; break;
        case RotDir.RIGHT: camRot += 0.7 * Math.PI * numSecs; break;
      }

      // When the 'camLoc' goes outside the range [0,1]x[0,1], the 'rootTile' is
      // updated to the appropriate adjacent tile. If no such tile exists,
      // 'camLoc' is clamped within [0,1]x[0,1].
      if ( camLoc.x > 1 ) {
        let rightTile = rootTile.getAdjacent( CDir.EAST );
        if ( rightTile ) {
          rootTile = rightTile;
          camLoc = new Vec2( camLoc.x - 1, camLoc.y );
        } else {
          camLoc = new Vec2( 1, camLoc.y );
        }
      } else if ( camLoc.x < 0 ) {
        let leftTile = rootTile.getAdjacent( CDir.WEST );
        if ( leftTile ) {
          rootTile = leftTile;
          camLoc = new Vec2( camLoc.x + 1, camLoc.y );
        } else {
          camLoc = new Vec2( 0, camLoc.y );
        }
      }

      if ( camLoc.y > 1 ) {
        let upTile = rootTile.getAdjacent( CDir.NORTH );
        if ( upTile ) {
          rootTile = upTile;
          camLoc = new Vec2( camLoc.x, camLoc.y - 1 );
        } else {
          camLoc = new Vec2( camLoc.x, 1 );
        }
      } else if ( camLoc.y < 0 ) {
        let downTile = rootTile.getAdjacent( CDir.SOUTH );
        if ( downTile ) {
          rootTile = downTile;
          camLoc = new Vec2( camLoc.x, camLoc.y + 1 );
        } else {
          camLoc = new Vec2( camLoc.x, 0 );
        }
      }

      render( ctx, new RenderConfig( canvas.width, canvas.height, undefined ), rootTile, camLoc, camRot );
    } );
  }
} );
