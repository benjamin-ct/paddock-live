// "1.2.10" > "1.2.9" ; bêtas : "1.28.0-beta.3" > "1.28.0-beta.2", et la version finale "1.28.0" passe avant
function newer(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v).replace(/^v/, '').split('-');
    return { n: core.split('.').map((x) => parseInt(x, 10) || 0), beta: pre ? parseInt(pre.split('.')[1], 10) || 0 : null };
  };
  const pa = parse(a); const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((pa.n[i] || 0) !== (pb.n[i] || 0)) return (pa.n[i] || 0) > (pb.n[i] || 0);
  }
  if (pa.beta === null || pb.beta === null) return pa.beta === null && pb.beta !== null;
  return pa.beta > pb.beta;
}

module.exports = { newer };
