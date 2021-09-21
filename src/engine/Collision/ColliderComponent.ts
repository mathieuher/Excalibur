import { Vector } from '../Math/vector';
import { TransformComponent } from '../EntityComponentSystem';
import { Component } from '../EntityComponentSystem/Component';
import { Entity } from '../EntityComponentSystem/Entity';
import { EventDispatcher } from '../EventDispatcher';
import { CollisionEndEvent, CollisionStartEvent, PostCollisionEvent, PreCollisionEvent } from '../Events';
import { Observable } from '../Util/Observable';
import { BoundingBox } from './BoundingBox';
import { CollisionContact } from './Detection/CollisionContact';
import { CircleCollider } from './Shapes/CircleCollider';
import { Collider } from './Shapes/Collider';
import { CompositeCollider } from './Shapes/CompositeCollider';
import { ConvexPolygon } from './Shapes/ConvexPolygon';
import { Edge } from './Shapes/Edge';
import { Shape } from './Shapes/Shape';

export class ColliderComponent extends Component<'ex.collider'> {
  public readonly type = 'ex.collider';

  public events = new EventDispatcher(this);
  /**
   * Observable that notifies when a collider is added to the body
   */
  public $colliderAdded = new Observable<Collider>();

  /**
   * Observable that notifies when a collider is removed from the body
   */
  public $colliderRemoved = new Observable<Collider>();

  constructor(collider?: Collider) {
    super();
    this.set(collider);
  }

  private _collider: Collider;
  public get() {
    return this._collider;
  }

  public set<T extends Collider>(collider: T): T {
    if (this._collider) {
      this.events.unwire(collider.events);
      this.$colliderRemoved.notifyAll(this._collider);
    }
    if (collider) {
      this._collider = collider;
      this._collider.owner = this.owner;
      this.events.wire(collider.events);
      this.$colliderAdded.notifyAll(collider);
      this.update();
    }
    return collider;
  }

  public get bounds() {
    return this._collider?.bounds ?? new BoundingBox();
  }

  public get localBounds() {
    return this._collider?.localBounds ?? new BoundingBox();
  }

  public update() {
    const tx = this.owner?.get(TransformComponent);
    if (this._collider) {
      this._collider.owner = this.owner;
      if (tx) {
        this._collider.update(tx);
      }
    }
  }

  collide(other: ColliderComponent): CollisionContact[] {
    let colliderA = this._collider;
    let colliderB = other._collider;

    // If we have a composite lefthand side :(
    // Might bite us, but to avoid updating all the handlers make composite always left side
    let flipped = false;
    if (colliderB instanceof CompositeCollider) {
      colliderA = colliderB;
      colliderB = this._collider;
      flipped = true;
    }

    if (this._collider) {
      const contacts = colliderA.collide(colliderB);
      if (contacts) {
        if (flipped) {
          contacts.forEach((contact) => {
            contact.mtv = contact.mtv.negate();
            contact.normal = contact.normal.negate();
            contact.tangent = contact.normal.perpendicular();
            contact.colliderA = this._collider;
            contact.colliderB = other._collider;
          });
        }
        return contacts;
      }
      return [];
    }
    return [];
  }

  onAdd(entity: Entity) {
    if (this._collider) {
      this.update();
    }
    // Wire up the collider events to the owning entity
    this.events.on('precollision', (evt: any) => {
      const precollision = evt as PreCollisionEvent<Collider>;
      entity.events.emit(
        'precollision',
        new PreCollisionEvent(precollision.target.owner, precollision.other.owner, precollision.side, precollision.intersection)
      );
    });
    this.events.on('postcollision', (evt: any) => {
      const postcollision = evt as PostCollisionEvent<Collider>;
      entity.events.emit(
        'postcollision',
        new PostCollisionEvent(postcollision.target.owner, postcollision.other.owner, postcollision.side, postcollision.intersection)
      );
    });
    this.events.on('collisionstart', (evt: any) => {
      const start = evt as CollisionStartEvent<Collider>;
      entity.events.emit('collisionstart', new CollisionStartEvent(start.target.owner, start.other.owner, start.contact));
    });
    this.events.on('collisionend', (evt: any) => {
      const end = evt as CollisionEndEvent<Collider>;
      entity.events.emit('collisionend', new CollisionEndEvent(end.target.owner, end.other.owner));
    });
  }

  onRemove() {
    this.events.clear();
    this.$colliderRemoved.notifyAll(this._collider);
  }

  /**
   * Sets up a box geometry based on the current bounds of the associated actor of this physics body.
   *
   * If no width/height are specified the body will attempt to use the associated actor's width/height.
   *
   * By default, the box is center is at (0, 0) which means it is centered around the actors anchor.
   */
  useBoxCollider(width: number, height: number, anchor: Vector = Vector.Half, center: Vector = Vector.Zero): ConvexPolygon {
    const collider = Shape.Box(width, height, anchor, center);
    return (this.set(collider));
  }

  /**
   * Sets up a [[ConvexPolygon|convex polygon]] collision geometry based on a list of of points relative
   *  to the anchor of the associated actor
   * of this physics body.
   *
   * Only [convex polygon](https://en.wikipedia.org/wiki/Convex_polygon) definitions are supported.
   *
   * By default, the box is center is at (0, 0) which means it is centered around the actors anchor.
   */
  usePolygonCollider(points: Vector[], center: Vector = Vector.Zero): ConvexPolygon {
    const poly = Shape.Polygon(points, false, center);
    return (this.set(poly));
  }

  /**
   * Sets up a [[Circle|circle collision geometry]] as the only collider with a specified radius in pixels.
   *
   * By default, the box is center is at (0, 0) which means it is centered around the actors anchor.
   */
  useCircleCollider(radius: number, center: Vector = Vector.Zero): CircleCollider {
    const collider = Shape.Circle(radius, center);
    return (this.set(collider));
  }

  /**
   * Sets up an [[Edge|edge collision geometry]] with a start point and an end point relative to the anchor of the associated actor
   * of this physics body.
   *
   * By default, the box is center is at (0, 0) which means it is centered around the actors anchor.
   */
  useEdgeCollider(begin: Vector, end: Vector): Edge {
    const collider = Shape.Edge(begin, end);
    return (this.set(collider));
  }

  useCompositeCollider(colliders: Collider[]): CompositeCollider {
    return (this.set(new CompositeCollider(colliders)));
  }
}