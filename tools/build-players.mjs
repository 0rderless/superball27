// Builds assets/player.glb from Quaternius' Universal Animation Library 1 + 2 (CC0).
// Usage: node build-players.mjs <UAL1.glb> <UAL2.glb> <out.glb>
// Needs @gltf-transform/core + functions (npm i @gltf-transform/core @gltf-transform/functions).
import { NodeIO } from '@gltf-transform/core';
import { resample, prune, dedup } from '@gltf-transform/functions';

const [, , ual1Path, ual2Path, outPath] = process.argv;

const KEEP1 = [
  'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jog_Bwd_Loop', 'Jog_Left_Loop', 'Jog_Right_Loop',
  'Kick', 'Celebration', 'BackFlip', 'Dodge_Left', 'Dodge_Right', 'Jump_Start', 'Jump_Loop', 'Jump_Land',
  'Hit_Chest', 'Idle_Tired_Loop', 'Crying', 'Turn90_L', 'Turn90_R', 'Crouch_Idle_Loop', 'Dance_Loop', 'Roll',
  'PunchKick_Enter', 'Death01', 'Idle_LookAround_Loop',
];
const KEEP2 = [
  'Slide_Start', 'Slide_Loop', 'Slide_Exit', 'OverhandThrow', 'Walk_Carry_Loop', 'Hit_Knockback', 'KipUp',
  'Turn180_L', 'Turn180_R', 'Yes', 'Idle_No_Loop', 'Idle_FoldArms_Loop', 'JogToFlip', 'Surprise', 'DoubleJump',
];
// finger bones are dropped from the animation (hands stay in their rest pose)
const skipNode = n => /^(index|middle|pinky|ring|thumb)_/.test(n);
// only rotations carry the motion; translation is kept just for the hips (and root), scale never
const skipChannel = (node, path) => path === 'scale' || (path === 'translation' && !/^(pelvis|root)$/.test(node));

const io = new NodeIO();
const doc = await io.read(ual1Path);
const src2 = await io.read(ual2Path);
const root = doc.getRoot();
const nodesByName = new Map(root.listNodes().map(n => [n.getName(), n]));
const buffer = root.listBuffers()[0];

for (const anim of root.listAnimations()) {
  if (!KEEP1.includes(anim.getName())) {
    for (const smp of anim.listSamplers()) smp.dispose();
    for (const ch of anim.listChannels()) ch.dispose();
    anim.dispose();
    continue;
  }
  for (const ch of anim.listChannels()) {
    const t = ch.getTargetNode();
    if (t && (skipNode(t.getName()) || skipChannel(t.getName(), ch.getTargetPath()))) { ch.getSampler().dispose(); ch.dispose(); }
  }
}

for (const a2 of src2.getRoot().listAnimations()) {
  if (!KEEP2.includes(a2.getName())) continue;
  const anim = doc.createAnimation(a2.getName());
  for (const ch of a2.listChannels()) {
    const name = ch.getTargetNode() && ch.getTargetNode().getName();
    const target = nodesByName.get(name);
    if (!target || skipNode(name) || skipChannel(name, ch.getTargetPath())) continue;
    const s2 = ch.getSampler();
    const input = doc.createAccessor().setType('SCALAR').setArray(s2.getInput().getArray().slice()).setBuffer(buffer);
    const output = doc.createAccessor().setType(s2.getOutput().getType()).setArray(s2.getOutput().getArray().slice()).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s2.getInterpolation());
    anim.addSampler(sampler);
    anim.addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}

// drop accessors no longer used by anything (the discarded clips' keyframes)
for (const acc of root.listAccessors()) if (acc.listParents().every(p => p === root)) acc.dispose();
await doc.transform(resample({ tolerance: 1e-4 }), dedup(), prune());
await io.write(outPath, doc);
console.log('animations:', root.listAnimations().length);
