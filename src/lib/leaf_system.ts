import p5 from 'p5';

export enum AppState {
  IDLE = 'IDLE',
  CAPTURING = 'CAPTURING',
  ANALYZING = 'ANALYZING',
  CONFIRMING = 'CONFIRMING',
  READY = 'READY',
  GROWING = 'GROWING',
  GROWN = 'GROWN',
}

export interface Leaf {
  offset: p5.Vector;
  pos: p5.Vector;
  vel: p5.Vector;
  char: string;
  size: number;
  index: number;
  scale: number;
  birdImgIdx: number;
  isBird: boolean; // 1/2 birds, 1/2 invisible when flying
  color: string;
}

export interface ColorConfig {
  color: string;
  percent: number;
}

export interface Cluster {
  home: p5.Vector;
  leaves: Leaf[];
  isFlying: boolean;
  vel: p5.Vector;
  pos: p5.Vector; // Current position of the cluster center
}

const BIRD_URLS = [
  'https://raw.githubusercontent.com/iqnuxul/touchTree/main/Image%202%201.png',
  'https://raw.githubusercontent.com/iqnuxul/touchTree/main/Image%202%202.png',
  'https://raw.githubusercontent.com/iqnuxul/touchTree/main/Image%202%203.png',
  'https://raw.githubusercontent.com/iqnuxul/touchTree/main/Image%202.png'
];

export class LeafSystem {
  private clusters: Cluster[] = [];
  private state: AppState = AppState.IDLE;
  private growthProgress: number = 0;
  private width: number = 0;
  private height: number = 0;
  private birdImages: p5.Image[] = [];
  private lastFingerPos: p5.Vector | null = null;
  private colorConfigs: ColorConfig[] = [{ color: '#ffffff', percent: 100 }];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  loadImages(p: p5) {
    if (this.birdImages.length > 0) return;
    BIRD_URLS.forEach(url => {
      p.loadImage(url, (img) => {
        this.birdImages.push(img);
      });
    });
  }

  updateDimensions(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  updateText(inputText: string) {
    const chars = inputText.split('').filter(c => c.trim() !== '');
    if (chars.length === 0) return;
    let leafIdx = 0;
    for (const cluster of this.clusters) {
      for (const leaf of cluster.leaves) {
        leaf.char = chars[leafIdx % chars.length];
        leafIdx++;
      }
    }
  }

  updateColors(configs: ColorConfig[]) {
    this.colorConfigs = configs;
    // Re-assign colors to existing leaves
    for (const cluster of this.clusters) {
      for (const leaf of cluster.leaves) {
        leaf.color = this.getRandomColor();
      }
    }
  }

  private getRandomColor(): string {
    const rand = Math.random() * 100;
    let cumulative = 0;
    for (const config of this.colorConfigs) {
      cumulative += config.percent;
      if (rand <= cumulative) return config.color;
    }
    return this.colorConfigs[0]?.color || '#ffffff';
  }

  syncWithSkeleton(branches: { x: number; y: number }[][], inputText: string) {
    const chars = inputText.split('').filter(c => c.trim() !== '');
    if (chars.length === 0) return;

    this.clusters = [];
    
    // Find the vertical span to identify the trunk area
    let minY = Infinity;
    let maxY = -Infinity;
    for (const branch of branches) {
      for (const pt of branch) {
        minY = Math.min(minY, pt.y);
        maxY = Math.max(maxY, pt.y);
      }
    }
    const treeHeight = maxY - minY;
    // The trunk is typically the bottom 20-25% of the detected structure
    const trunkThreshold = maxY - treeHeight * 0.22;

    // For each branch in the skeleton
    for (const branch of branches) {
      for (let i = 0; i < branch.length; i++) {
        const pt = branch[i];
        
        // Skip points that are in the trunk area (bottom part of the tree)
        // Also skip the very first point of any branch as it's usually the connection point
        if (pt.y > trunkThreshold || i === 0) continue;

        const isTip = i === branch.length - 1;
        const clusterPos = new p5.Vector(pt.x, pt.y);
        const cluster: Cluster = {
          home: clusterPos.copy(),
          pos: clusterPos.copy(),
          vel: new p5.Vector(0, 0),
          isFlying: false,
          leaves: []
        };

        // More leaves at the tips, and closer to the branch
        const leafCount = isTip ? (Math.floor(Math.random() * 5) + 10) : (Math.floor(Math.random() * 5) + 6);
        for (let j = 0; j < leafCount; j++) {
          const radius = isTip ? (Math.random() * 45 + 15) : (Math.random() * 30 + 15);
          const angle = Math.random() * Math.PI * 2;
          const offset = new p5.Vector(Math.cos(angle) * radius, Math.sin(angle) * radius);
          
          const isSmall = Math.random() < 0.5;
          cluster.leaves.push({
            offset: offset,
            pos: p5.Vector.add(clusterPos, offset),
            vel: new p5.Vector(0, 0),
            char: chars[(i * 10 + j) % chars.length],
            size: isSmall ? (Math.random() * 1.5 + 1) : (Math.random() * 2 + 2),
            index: i * 10 + j,
            scale: 0,
            birdImgIdx: Math.floor(Math.random() * BIRD_URLS.length),
            isBird: Math.random() < 0.2,
            color: this.getRandomColor()
          });
        }
        this.clusters.push(cluster);
      }
    }
  }

  triggerGrow() {
    if (this.state === AppState.CONFIRMING || this.state === AppState.READY || this.state === AppState.IDLE) {
      this.state = AppState.GROWING;
      this.growthProgress = 0;
    }
  }

  setState(state: AppState) {
    this.state = state;
  }

  update(p: p5, fingerPos: p5.Vector | null) {
    this.lastFingerPos = fingerPos;
    const attraction = 0.0017; // 70% faster return (0.001 * 1.7)
    const damping = 0.9; // Friction, keeps motion smooth
    const repel_radius = 100; // Distance from finger at which repulsion starts
    const repel_strength = 28; // Repulsion force

    if (this.state === AppState.GROWING) {
      this.growthProgress += 0.02;
      if (this.growthProgress >= 1) {
        this.state = AppState.GROWN;
      }
    }

    for (const cluster of this.clusters) {
      // Cluster physics
      const toHome = p5.Vector.sub(cluster.home, cluster.pos);
      const distToHome = toHome.mag();
      const spring = p5.Vector.mult(toHome, attraction);
      cluster.vel.add(spring);

      // Scatter interaction (only in GROWN state)
      if (this.state === AppState.GROWN && fingerPos) {
        const distance = p5.Vector.dist(cluster.pos, fingerPos);
        if (distance < repel_radius) {
          const awayFromFinger = p5.Vector.sub(cluster.pos, fingerPos);
          awayFromFinger.normalize();
          const repel = repel_strength * (1 - distance / repel_radius);
          awayFromFinger.mult(repel);
          cluster.vel.add(awayFromFinger);
          cluster.isFlying = true;
        } else if (distToHome < 5) { // Only stop flying when very close to home
          cluster.isFlying = false;
        }
      } else if (distToHome < 5) {
        cluster.isFlying = false;
      }

      cluster.vel.mult(damping);
      cluster.pos.add(cluster.vel);

      // Update individual leaves based on cluster position
      for (const leaf of cluster.leaves) {
        // Scale animation
        if (this.state === AppState.GROWING || this.state === AppState.GROWN) {
          const target = cluster.isFlying ? 0.8 : 1;
          leaf.scale = p.lerp(leaf.scale, target, 0.02);
        }

        // Leaf position is cluster position + offset
        leaf.pos.set(p5.Vector.add(cluster.pos, leaf.offset));
      }
    }
  }

  draw(p: p5) {
    p.imageMode(p.CENTER);
    for (const cluster of this.clusters) {
      for (const leaf of cluster.leaves) {
        const alpha = 204; // 20% transparent (80% opacity)
        
        if (this.state === AppState.CONFIRMING || this.state === AppState.IDLE || (this.state === AppState.GROWING && leaf.scale < 0.1)) {
          // Placeholder state: use simple white dots
          p.noStroke();
          p.fill(255, 150); // Slightly more transparent for placeholders
          p.ellipse(leaf.pos.x, leaf.pos.y, leaf.size, leaf.size);
        } else if (this.state === AppState.READY) {
          // Ready state: hide everything until growth starts
          continue;
        } else {
          // Check distance to home for bird vs text transformation
          const distToHome = p5.Vector.dist(cluster.pos, cluster.home);
          
          if (cluster.isFlying || distToHome > 20) {
            // Flying state or far from home
            if (leaf.isBird) {
              // 2/3 are birds
              const img = this.birdImages[leaf.birdImgIdx];
              p.push();
              p.translate(leaf.pos.x, leaf.pos.y);
              p.scale(leaf.scale);
              
              // Add soft light around birds
              if (p.drawingContext) {
                (p.drawingContext as any).shadowBlur = 12;
                (p.drawingContext as any).shadowColor = 'rgba(255, 255, 255, 0.4)';
              }

              if (img && img.width > 0) {
                p.image(img, 0, 0, 30, 30);
              } else {
                p.fill(255, alpha);
                p.textSize(18 + Math.sin(p.frameCount * 0.1 + leaf.index) * 3);
                p.text(leaf.char, 0, 0);
              }
              p.pop();
            } else {
              // 1/3 are invisible when flying
              // Do nothing
            }
          } else {
            // Home state: use white text
            p.push();
            p.translate(leaf.pos.x, leaf.pos.y);
            p.scale(leaf.scale);
            
            // Add soft light around text
            if (p.drawingContext) {
              (p.drawingContext as any).shadowBlur = 8; // Reduced range
              (p.drawingContext as any).shadowColor = this.hexToRgba(leaf.color, 0.3); // Less bright
            }

            p.fill(this.hexToRgba(leaf.color, alpha / 255));
            p.textSize(18 + Math.sin(p.frameCount * 0.1 + leaf.index) * 3);
            p.text(leaf.char, 0, 0);
            p.pop();
          }
        }
      }
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    let r = 255, g = 255, b = 255;
    if (hex.startsWith('#')) {
      const h = hex.slice(1);
      if (h.length === 3) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
      } else if (h.length === 6) {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
      }
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  getState() {
    return this.state;
  }

  getSkeleton() {
    return this.clusters.map(c => c.home);
  }

  getLeafCount() {
    return this.clusters.reduce((acc, c) => acc + c.leaves.length, 0);
  }
}
