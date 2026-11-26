"""Small ASAR reader/repacker; no npm installation required."""
import hashlib
import json
import pathlib
import struct
import sys


def read_header(path):
    with open(path, 'rb') as f:
        sizes = struct.unpack('<4I', f.read(16))
        return json.loads(f.read(sizes[3])), 8 + sizes[1]


def entries(node, prefix=''):
    for name, entry in node['files'].items():
        path = prefix + name
        if 'files' in entry:
            yield from entries(entry, path + '/')
        else:
            yield path, entry


def extract(archive, destination):
    header, base = read_header(archive)
    root = pathlib.Path(destination)
    with open(archive, 'rb') as f:
        for name, entry in entries(header):
            if entry.get('unpacked') or 'link' in entry:
                continue
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            f.seek(base + int(entry['offset']))
            target.write_bytes(f.read(entry['size']))


def repack(archive, output, replacements):
    header, base = read_header(archive)
    blobs = []
    offset = 0
    with open(archive, 'rb') as f:
        for name, entry in entries(header):
            if entry.get('unpacked') or 'link' in entry:
                continue
            if name in replacements:
                blob = pathlib.Path(replacements[name]).read_bytes()
                block_size = entry.get('integrity', {}).get('blockSize', 4194304)
                entry['integrity'] = {
                    'algorithm': 'SHA256', 'hash': hashlib.sha256(blob).hexdigest(),
                    'blockSize': block_size,
                    'blocks': [hashlib.sha256(blob[i:i+block_size]).hexdigest()
                               for i in range(0, len(blob), block_size)]}
            else:
                f.seek(base + int(entry['offset']))
                blob = f.read(entry['size'])
            entry['size'] = len(blob)
            entry['offset'] = str(offset)
            offset += len(blob)
            blobs.append(blob)
    encoded = json.dumps(header, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    padding = bytes((-len(encoded)) % 4)
    header_payload = struct.pack('<II', 4 + len(encoded) + len(padding), len(encoded)) + encoded + padding
    with open(output, 'wb') as f:
        f.write(struct.pack('<II', 4, len(header_payload)))
        f.write(header_payload)
        for blob in blobs:
            f.write(blob)


if __name__ == '__main__':
    if sys.argv[1] == 'extract':
        extract(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == 'list':
        h, _ = read_header(sys.argv[2])
        for name, entry in entries(h):
            print(name, entry.get('size', 0))
