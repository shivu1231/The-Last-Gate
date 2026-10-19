import * as THREE from 'three';
import { SceneKit } from '../../phase2/SceneKit';

/** A stable path in world coordinates; surrounding architecture never parents this trace. */
export class VectorTrace {
  root = new THREE.Group();
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  private kit = new SceneKit('afterimage / resources');
  private core: THREE.LineBasicMaterial;
  private halo: THREE.MeshBasicMaterial;
  private nodes: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  constructor(start: THREE.Vector3, end: THREE.Vector3) {
    this.start = start;
    this.end = end;
    this.core = this.kit.ownMaterial(
      new THREE.LineBasicMaterial({
        color: '#c2f1ff',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    const points: number[] = [];
    for (let index = 0; index < 19; index++) {
      const startPoint = start.clone().lerp(end, index / 19),
        endPoint = start.clone().lerp(end, (index + 0.86) / 19);
      points.push(
        startPoint.x,
        startPoint.y,
        startPoint.z,
        endPoint.x,
        endPoint.y,
        endPoint.z,
      );
    }
    const geometry = this.kit.ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    );
    this.root.add(new THREE.LineSegments(geometry, this.core));
    this.halo = this.kit.ownMaterial(
      new THREE.MeshBasicMaterial({
        color: '#4795c1',
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const direction = end.clone().sub(start),
      length = direction.length();
    const halo = new THREE.Mesh(
      this.kit.ownGeometry(
        new THREE.CylinderGeometry(0.055, 0.055, length, 5, 1, true),
      ),
      this.halo,
    );
    halo.position.copy(start).add(end).multiplyScalar(0.5);
    halo.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    this.root.add(halo);
    this.nodes = new THREE.InstancedMesh(
      this.kit.ownGeometry(new THREE.OctahedronGeometry(0.055)),
      this.coreAsMesh(),
      12,
    );
    for (let index2 = 0; index2 < 12; index2++) {
      this.dummy.position.copy(start).lerp(end, index2 / 11);
      this.dummy.updateMatrix();
      this.nodes.setMatrixAt(index2, this.dummy.matrix);
    }
    this.root.add(this.nodes);
    this.root.name = 'AFTERIMAGE / stable dimensional scar';
  }
  private coreAsMesh() {
    return this.kit.ownMaterial(
      new THREE.MeshBasicMaterial({
        color: '#a7e5fa',
        transparent: true,
        opacity: 0.8,
      }),
    );
  }
  opacity(value: number) {
    this.root.visible = value > 0.005;
    this.core.opacity = value;
    this.halo.opacity = value * 0.13;
    (this.nodes.material as THREE.MeshBasicMaterial).opacity = value * 0.75;
  }
  dispose() {
    this.root.removeFromParent();
    this.kit.dispose();
  }
}
