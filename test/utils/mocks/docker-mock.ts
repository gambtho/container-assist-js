/**
 * ESM-compatible mock for dockerode
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { Readable } from 'stream';

export class MockStream extends EventEmitter {
  pipe = jest.fn().mockReturnThis();
  destroy = jest.fn();
  
  constructor() {
    super();
    // Override on to properly handle events
    this.on = jest.fn().mockImplementation((event: string, handler: Function) => {
      if (event === 'end') {
        process.nextTick(() => handler());
      }
      return super.on(event, handler);
    }) as any;
  }
}

export class MockBuildStream extends Readable {
  private chunks: string[] = [];
  private index = 0;
  
  constructor(chunks: string[] = []) {
    super();
    this.chunks = chunks;
  }
  
  _read() {
    if (this.index < this.chunks.length) {
      this.push(this.chunks[this.index++]);
    } else {
      this.push(null);
    }
  }
}

export const mockContainer = {
  id: 'mock-container-id',
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  kill: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  inspect: jest.fn().mockResolvedValue({
    Id: 'mock-container-id',
    State: {
      Status: 'running',
      Running: true,
      ExitCode: 0,
      StartedAt: new Date().toISOString()
    },
    Config: {
      Image: 'mock-image:latest',
      Env: []
    },
    NetworkSettings: {
      Networks: {}
    }
  }),
  logs: jest.fn().mockImplementation((options) => {
    if (options && options.follow) {
      const stream = new MockStream();
      process.nextTick(() => {
        stream.emit('data', Buffer.from('mock log line 1\n'));
        stream.emit('data', Buffer.from('mock log line 2\n'));
        stream.emit('end');
      });
      return Promise.resolve(stream);
    }
    return Promise.resolve(Buffer.from('mock logs'));
  }),
  attach: jest.fn().mockResolvedValue(new MockStream()),
  wait: jest.fn().mockResolvedValue({ StatusCode: 0 }),
  exec: jest.fn().mockResolvedValue({
    start: jest.fn().mockResolvedValue(undefined),
    inspect: jest.fn().mockResolvedValue({ ExitCode: 0 })
  })
};

export const mockImage = {
  id: 'sha256:mock-image-id',
  inspect: jest.fn().mockResolvedValue({
    Id: 'sha256:mock-image-id',
    RepoTags: ['mock-image:latest'],
    RepoDigests: [],
    Size: 1000000,
    Architecture: 'amd64',
    Os: 'linux',
    Created: new Date().toISOString()
  }),
  history: jest.fn().mockResolvedValue([
    { Id: 'sha256:layer1', Size: 500000 },
    { Id: 'sha256:layer2', Size: 500000 }
  ]),
  remove: jest.fn().mockResolvedValue(undefined),
  tag: jest.fn().mockResolvedValue(undefined),
  push: jest.fn().mockImplementation((options) => {
    const stream = new MockStream();
    process.nextTick(() => {
      stream.emit('data', JSON.stringify({ status: 'Pushing...' }));
      stream.emit('data', JSON.stringify({ status: 'Pushed' }));
      stream.emit('end');
    });
    return Promise.resolve(stream);
  }),
  get: jest.fn().mockImplementation(() => {
    const stream = new MockStream();
    process.nextTick(() => {
      stream.emit('data', Buffer.from('mock image data'));
      stream.emit('end');
    });
    return Promise.resolve(stream);
  })
};

export const mockDockerode = {
  // Core operations
  ping: jest.fn().mockResolvedValue('OK'),
  version: jest.fn().mockResolvedValue({
    Version: '20.10.0',
    ApiVersion: '1.41',
    Os: 'linux',
    Arch: 'amd64',
    KernelVersion: '5.10.0',
    BuildTime: new Date().toISOString()
  }),
  info: jest.fn().mockResolvedValue({
    ServerVersion: '20.10.0',
    OperatingSystem: 'Docker Desktop',
    Architecture: 'x86_64',
    NCPU: 4,
    MemTotal: 8000000000,
    DockerRootDir: '/var/lib/docker',
    Driver: 'overlay2',
    SystemTime: new Date().toISOString()
  }),
  
  // Container operations
  listContainers: jest.fn().mockResolvedValue([]),
  createContainer: jest.fn().mockResolvedValue(mockContainer),
  getContainer: jest.fn().mockReturnValue(mockContainer),
  
  // Image operations  
  listImages: jest.fn().mockResolvedValue([]),
  pull: jest.fn().mockImplementation((image: string, options: any, callback?: Function) => {
    const stream = new MockStream();
    
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    
    if (callback) {
      callback(null, stream);
      process.nextTick(() => {
        stream.emit('data', JSON.stringify({ status: `Pulling ${image}...` }));
        stream.emit('data', JSON.stringify({ status: 'Pull complete' }));
        stream.emit('end');
      });
    }
    
    return Promise.resolve(stream);
  }),
  buildImage: jest.fn().mockImplementation((tarStream: any, options: any) => {
    const stream = new MockBuildStream([
      JSON.stringify({ stream: 'Step 1/5 : FROM node:18\n' }),
      JSON.stringify({ stream: '---> Using cache\n' }),
      JSON.stringify({ stream: 'Step 2/5 : WORKDIR /app\n' }),
      JSON.stringify({ stream: '---> Using cache\n' }),
      JSON.stringify({ stream: 'Step 3/5 : COPY . .\n' }),
      JSON.stringify({ stream: '---> abc123def\n' }),
      JSON.stringify({ stream: 'Step 4/5 : RUN npm install\n' }),
      JSON.stringify({ stream: '---> def456ghi\n' }),
      JSON.stringify({ stream: 'Step 5/5 : CMD ["npm", "start"]\n' }),
      JSON.stringify({ stream: '---> ghi789jkl\n' }),
      JSON.stringify({ stream: 'Successfully built ghi789jkl\n' }),
      JSON.stringify({ stream: `Successfully tagged ${options.t || 'image:latest'}\n` })
    ]);
    
    return Promise.resolve(stream);
  }),
  getImage: jest.fn().mockReturnValue(mockImage),
  
  // Volume operations
  listVolumes: jest.fn().mockResolvedValue({ 
    Volumes: [], 
    Warnings: null 
  }),
  createVolume: jest.fn().mockResolvedValue({ 
    Name: 'mock-volume',
    Driver: 'local',
    Mountpoint: '/var/lib/docker/volumes/mock-volume/_data',
    Labels: {},
    Scope: 'local'
  }),
  getVolume: jest.fn().mockReturnValue({
    inspect: jest.fn().mockResolvedValue({
      Name: 'mock-volume',
      Driver: 'local'
    }),
    remove: jest.fn().mockResolvedValue(undefined)
  }),
  
  // Network operations
  listNetworks: jest.fn().mockResolvedValue([]),
  createNetwork: jest.fn().mockResolvedValue({ 
    Id: 'mock-network-id',
    Warning: ''
  }),
  getNetwork: jest.fn().mockReturnValue({
    inspect: jest.fn().mockResolvedValue({
      Id: 'mock-network-id',
      Name: 'mock-network',
      Driver: 'bridge'
    }),
    remove: jest.fn().mockResolvedValue(undefined)
  }),
  
  // Registry operations
  searchImages: jest.fn().mockResolvedValue([]),
  
  // Utility
  modem: {
    followProgress: jest.fn((stream: any, onProgress: Function, onFinished: Function) => {
      const output: any[] = [];
      
      stream.on('data', (chunk: any) => {
        if (onProgress) {
          onProgress(null, chunk);
        }
        output.push(chunk);
      });
      
      stream.on('end', () => {
        if (onFinished) {
          onFinished(null, output);
        }
      });
      
      stream.on('error', (err: Error) => {
        if (onFinished) {
          onFinished(err, output);
        }
      });
    }),
    demuxStream: jest.fn((stream: any, stdout: any, stderr: any) => {
      // Simulate demuxing
      if (stdout) {
        stdout.write('mock stdout');
        stdout.end();
      }
      if (stderr) {
        stderr.write('mock stderr');
        stderr.end();
      }
    })
  },
  
  // Events
  getEvents: jest.fn().mockImplementation((options) => {
    const stream = new MockStream();
    process.nextTick(() => {
      stream.emit('data', JSON.stringify({
        status: 'start',
        id: 'container-id',
        from: 'image:latest'
      }));
    });
    return Promise.resolve(stream);
  })
};

// Mock factory function
export function createMockDocker(options: any = {}) {
  return {
    ...mockDockerode,
    ...options
  };
}

// Mock tar-fs module
export const mockTarFs = {
  pack: jest.fn().mockImplementation((dir: string, options?: any) => {
    const stream = new MockStream();
    process.nextTick(() => {
      stream.emit('data', Buffer.from('mock tar data'));
      stream.emit('end');
    });
    return stream;
  })
};

// Setup function for tests
export function setupDockerMocks() {
  // Reset all mocks
  Object.values(mockDockerode).forEach(value => {
    if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(mock => {
        if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
          mock.mockReset();
        }
      });
    } else if (typeof value === 'function' && typeof value.mockReset === 'function') {
      value.mockReset();
    }
  });
  
  Object.values(mockContainer).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
  
  Object.values(mockImage).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
  
  // Restore default behaviors
  mockDockerode.ping.mockResolvedValue('OK');
  mockDockerode.version.mockResolvedValue({
    Version: '20.10.17',
    ApiVersion: '1.41',
    Os: 'linux',
    Arch: 'amd64',
    KernelVersion: '5.10.0',
    BuildTime: new Date().toISOString()
  });
  mockDockerode.info.mockResolvedValue({
    ServerVersion: '20.10.0',
    OperatingSystem: 'Docker Desktop',
    Architecture: 'x86_64',
    NCPU: 4,
    MemTotal: 8000000000,
    DockerRootDir: '/var/lib/docker',
    Driver: 'overlay2',
    SystemTime: new Date().toISOString()
  });
  mockDockerode.listContainers.mockResolvedValue([]);
  mockDockerode.listImages.mockResolvedValue([]);
  mockDockerode.getContainer.mockReturnValue(mockContainer);
  mockDockerode.getImage.mockReturnValue(mockImage);
  mockDockerode.createContainer.mockResolvedValue(mockContainer);
  
  // Restore container default behaviors
  mockContainer.start.mockResolvedValue(undefined);
  mockContainer.stop.mockResolvedValue(undefined);
  mockContainer.remove.mockResolvedValue(undefined);
  mockContainer.wait.mockResolvedValue({ StatusCode: 0 });
  
  // Restore image default behaviors  
  mockImage.remove.mockResolvedValue(undefined);
  mockImage.tag.mockResolvedValue(undefined);
  
  // Restore tar-fs mock
  mockTarFs.pack.mockImplementation((dir: string, options?: any) => {
    const stream = new MockStream();
    process.nextTick(() => {
      stream.emit('data', Buffer.from('mock tar data'));
      stream.emit('end');
    });
    return stream;
  });
}