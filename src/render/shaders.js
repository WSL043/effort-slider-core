/**
 * GLSL for the rail.
 *
 * Three passes:
 *
 *   1. FIELD      draws this frame's light on top of what is left of the last
 *                 one (afterglow), and writes energy (how much light) and
 *                 temperature (where on the palette ramp). No colour yet.
 *   2. BLUR       blurs only the hottest parts, for the glow.
 *   3. COMPOSITE  colours both through the palette ramp: light on dark
 *                 rails, ink on light ones.
 *
 * Every mode keeps the same rules (docs/DESIGN.md explains each):
 *
 *   - It is an event. Light starts because something was chosen or touched.
 *   - Every cell is an individual: its hash sets when it answers, how fast,
 *     and in what phase. The crowd draws the shape.
 *   - The front is the most alive part.
 *   - The source has a pulse.
 *   - Colour is temperature: fresh light is white, it cools to the hue.
 *   - Light lingers, and only what is hot glows.
 *
 * The modes are four phenomena read through those rules:
 *
 *   0 fire      the rail catches and burns
 *   1 synapse   the source beats; each beat finds its own path through cells
 *   2 frost     cold spreads, cells freeze into crystals that glint
 *   3 plankton  dark water that lights only where it is disturbed
 *
 * Coordinates: `p` is in rail heights (p.y runs 0-1 across the rail, p.x runs
 * along it), and a cell is 1 / rows of that, so cells stay square at any width.
 * `d` is how far a cell sits behind the thumb, in the same units.
 */

export const VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main(){v_uv=a_position*0.5+0.5;gl_Position=vec4(a_position,0.0,1.0);}`

export const FIELD = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res;
uniform sampler2D u_back;
uniform float u_time;
uniform float u_keep;
uniform float u_head;
uniform float u_edge;
uniform float u_rows;
uniform float u_seed;
uniform float u_from;
uniform float u_to;
uniform float u_since;
uniform float u_level;
uniform float u_charge;
uniform float u_burst;
uniform float u_vel;
uniform float u_mode;
uniform vec4 u_p;        // flicker, sparks, fill, gain
uniform vec4 u_timing;   // catchDelay, catchDuration, releaseDelay, releaseDuration
out vec4 o;

const float TAU=6.2831853;
float hash(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}

// ---- the cell, shared by every mode
vec2 id;
float h,h2,t,lv,ts,x,source,d,filled,at,k,delay,dur,extent,running,across,body,behind,lit;
bool grow;

// ---- what this frame adds: energy, and energy-weighted temperature
float E=0.0,W=0.0;
void add(float e,float temp){E+=e;W+=e*clamp(temp,0.0,1.0);}

bool inside(){return extent>0.002&&d>-0.02&&d<=extent;}
float dnOf(){return clamp(d/max(extent,1e-3),0.0,1.0);}

// The moment this cell's own front reached it while the event was growing.
// Negative when it has not been reached by this event.
float joinedAgo(){
  if(!grow||at<=u_from)return -1.0;
  float share=clamp((at-u_from)/max(u_to-u_from,1e-3),0.0,1.0);
  return u_since-(delay+(1.0-pow(1.0-share,1.0/3.0))*dur);
}
// Seconds since this cell's front left it while the event was shrinking.
float leftAgo(){
  if(grow||at<=u_to||at>=u_from+0.03||d<=extent)return -1.0;
  float share=clamp((u_from-at)/max(u_from-u_to,1e-3),0.0,1.0);
  return u_since-(delay+share*dur);
}

// ------------------------------------------------------------------ fire
void fireMode(){
  if(inside()){
    float dn=dnOf();
    float bright=pow(1.0-dn,0.65);
    // Flames: three waves of different length run away from the source;
    // each cell is out of phase with its neighbours, so they shimmer apart.
    float wave=sin(d*2.4-t*15.0*ts+h*TAU)+0.5*sin(d*1.4-t*8.0*ts+h*3.1)+0.25*sin(d*4.2-t*25.0*ts+h*10.0);
    float flame=smoothstep(0.08,0.92,wave*0.35*u_p.x+0.5);
    // Pulse: beats leave the source, measured along the fire itself.
    float beat=sin(dn*16.0-t*5.0*ts+h*3.0);
    float swell=sin(dn*8.0-t*2.5*ts+h*5.0);
    float pulse=pow(max(smoothstep(-0.15,0.55,beat)*(swell*0.5+0.5),0.0),1.2);
    add(bright*body*(flame*0.42+pulse*0.38)*mix(0.3,1.0,lv)*1.35,pow(1.0-dn,1.5));
    float ago=joinedAgo();
    if(ago>=0.0)add(exp(-ago*3.2)*bright*body*0.6,min(1.0,1.2-dn));
    add(exp(-pow((d-u_burst*4.0)*2.2,2.0))*exp(-u_burst*1.6)*body*0.5,0.95);
  }
  if(extent>0.002){
    // The burning edge flickers hardest while it runs, then smoulders.
    float shimmer=(0.5+0.5*sin(d*3.6+t*20.0*ts+h*TAU))*(0.5+0.5*sin(d*2.2+t*11.0*ts+h*3.1));
    add(exp(-pow((d-extent)*1.6,2.0))*(0.25+1.5*shimmer)*mix(0.35,1.0,lv)*mix(0.18,0.9,running),0.7);
    // Sparks run ahead of it, into the dark.
    float lead=d-extent;
    float zone=smoothstep(0.9,0.0,lead)*step(0.0,lead)*body;
    add(zone*step(0.6,h2)*(0.5+0.5*sin(lead*8.0+t*20.0*ts+h2*TAU))*smoothstep(0.45,1.0,lv)*mix(0.15,0.6,running),0.8);
  }
  // Sparks thrown back along each row.
  if(extent>0.002&&d>0.0&&d<extent){
    float count=floor(u_p.y*3.0+0.5);
    for(int i=0;i<9;i++){
      if(float(i)>=count)break;
      float hr=hash(vec2(id.y,float(i)*7.3)+u_seed);
      float run=fract(t*(0.38+hr*0.15)*ts+hr*7.0);
      float sx=source-run*extent;
      add(smoothstep(0.75/u_rows,0.0,abs(x-sx))*(1.0-run)*(1.0-run)*mix(0.3,1.0,lv)*0.7,0.9);
    }
  }
  // Going out: cells the fire has left keep an ember for a moment.
  float left=leftAgo();
  if(left>0.0)add(exp(-left*1.4)*step(0.4,h2)*(0.55+0.45*sin(t*6.0+h*20.0))*body*0.45,0.25);
  // The source: a white core under the thumb, and a halo.
  add(exp(-pow(d*1.3,2.0))*(0.4+1.6*lv)*(1.0+0.15*sin(t*2.8))*lit*body*behind,1.0);
  add(exp(-pow(d*0.28,2.0))*0.12*lv*lit*behind,0.6);
}

// --------------------------------------------------------------- synapse
void synapseMode(){
  float rate=mix(0.7,2.4,lv)*(1.0+0.5*u_charge);
  float speed=mix(3.5,7.0,lv);
  if(inside()){
    float dn=dnOf();
    // Each beat leaves the source at n / rate. Every row conducts at its own
    // speed and every cell answers a little early or late, so a beat arrives
    // as a scatter, never as a column.
    float rowSpeed=speed*mix(0.7,1.3,hash(vec2(id.y,3.7)+u_seed));
    float phase=(t-d/rowSpeed-h*0.22)*rate;
    float n=floor(phase);
    float age=fract(phase)/rate;
    // A cell passes a beat on only by chance, less often far from the
    // source, and the dice are thrown again for every beat: each beat takes
    // its own path.
    float chance=mix(0.7,0.12,dn)*mix(0.6,1.0,lv);
    float fires=step(hash(id+vec2(n*1.37,n*0.71)+u_seed),chance);
    add(fires*exp(-age*10.0)*body*mix(1.2,0.6,dn),mix(0.55,1.0,exp(-age*14.0)));
    // The network itself: faint where signals travel.
    add(body*0.045*(0.4+0.6*h)*(1.0-dn),0.1);
    float ago=joinedAgo();
    if(ago>=0.0)add(exp(-ago*4.0)*body*0.5*(1.0-dn*0.5),0.95);
    // A selection: one beat every cell passes on.
    float since=u_burst-d/rowSpeed-h*0.1;
    add(step(0.0,since)*exp(-since*7.0)*exp(-u_burst*0.5)*body*0.9,0.95);
  }
  // The front: where beats die out, a few cells still twitch.
  if(extent>0.002){
    float near=exp(-pow((d-extent)*2.0,2.0))*body;
    float twitch=pow(max(sin(t*(3.0+4.0*h2)+h*TAU),0.0),12.0);
    add(near*twitch*mix(0.25,0.8,running)*mix(0.4,1.0,lv),0.8);
  }
  // Going out: the last signals fade without being passed on.
  float left=leftAgo();
  if(left>0.0)add(exp(-left*2.2)*step(0.55,h2)*body*0.35,0.4);
  // The source fires with every beat.
  float sinceBeat=fract(t*rate)/rate;
  add(exp(-pow(d*1.3,2.0))*(0.3+1.1*exp(-sinceBeat*7.0))*mix(0.5,1.0,lv)*lit*body*behind,1.0);
}

// ----------------------------------------------------------------- frost
void frostMode(){
  if(inside()){
    float dn=dnOf();
    // Frozen: each crystal has its own density, and holds still.
    float crystal=body*pow(1.0-dn,0.5)*(0.2+0.3*h)*mix(0.5,1.0,lv);
    add(crystal,0.28+0.3*(1.0-dn));
    // Glints: rare and sharp, each crystal at its own moment.
    float rate=mix(0.12,0.45,h2)*mix(0.7,1.3,lv)*u_p.x;
    float glint=pow(max(sin(t*rate*TAU*0.5+h*40.0),0.0),160.0)*step(0.5,h)*(1.0-dn*0.6);
    add(glint*1.4,1.0);
    // Cold breath: a slow bright band leaves the source every few seconds.
    float breath=fract(t*0.26*mix(0.7,1.3,lv));
    add(exp(-pow((dn-breath)*7.0,2.0))*body*0.3*(1.0-breath),0.75);
    float ago=joinedAgo();
    if(ago>=0.0)add(exp(-ago*2.2)*body*0.55,0.95);
  }
  if(extent>0.002){
    // The freezing line: thin and white while it advances.
    add(exp(-pow((d-extent)*2.6,2.0))*body*(0.7+0.3*sin(t*7.0+h*TAU))*mix(0.2,0.95,running),0.95);
    // Needles: a few crystals already reach into the open rail.
    float lead=d-extent;
    float zone=smoothstep(0.7,0.0,lead)*step(0.0,lead);
    add(zone*step(0.74,h2)*(0.4+0.6*h)*mix(0.25,0.7,running)*body*0.5,0.7);
  }
  // Going out: crystals melt, brightening once as they let go.
  float left=leftAgo();
  if(left>0.0)add(exp(-left*0.9)*(0.6+0.4*cos(left*5.0))*step(0.35,h2)*body*0.4,0.5);
  // The source: a small, steady cold light.
  add(exp(-pow(d*1.6,2.0))*(0.3+0.9*lv)*lit*body*behind,1.0);
}

// -------------------------------------------------------------- plankton
void planktonMode(){
  // Each organism answers only when the stir beats its own threshold.
  float threshold=mix(0.12,0.8,h2);
  if(inside()){
    float dn=dnOf();
    // Swells leave the source; more effort sends them more often and further.
    float period=mix(4.2,1.7,lv);
    float age=fract(t/period+h*0.02)*period;
    float front=age*mix(2.4,4.6,lv);
    float swell=exp(-pow((d-front)*7.0,2.0))*(1.0-smoothstep(extent*0.6,extent,front));
    // A selection: one strong push.
    float push=exp(-pow((d-u_burst*5.0)*5.0,2.0))*exp(-u_burst*0.7)*1.5;
    // Not every organism is roused by every swell.
    float n=floor(t/period+h*0.02);
    float awake=step(hash(id+vec2(n*2.1,n*0.3)+u_seed),mix(0.35,0.7,lv));
    float answer=smoothstep(threshold,threshold+0.12,(swell*mix(0.7,1.1,lv))*awake+push*step(0.3,h));
    add(answer*body*mix(1.0,0.6,dn),0.85);
    // Resting: now and then one of them glows on its own.
    add(pow(max(sin(t*mix(0.25,0.8,h)+h*50.0),0.0),90.0)*(1.0-dn)*mix(0.2,0.7,lv)*body,0.7);
    // The water itself, barely there.
    add(body*0.03*(1.0-dn),0.1);
    float ago=joinedAgo();
    if(ago>=0.0)add(exp(-ago*3.0)*step(0.5,h)*body*0.5,0.9);
  }
  // The thumb's wake: moving it stirs the water around it.
  float stir=min(abs(u_vel)*0.5,1.6);
  float wake=exp(-pow(d*1.2,2.0))*stir*smoothstep(-0.5,0.1,d);
  add(smoothstep(threshold,threshold+0.15,wake)*step(0.35,h)*body,0.85);
  // Going out: the last of them fade back into the dark.
  float left=leftAgo();
  if(left>0.0)add(exp(-left*1.6)*step(0.6,h2)*body*0.3,0.5);
  // The source: dim, brighter while the water is stirred.
  add(exp(-pow(d*1.4,2.0))*(0.15+0.5*lv+0.6*min(stir,1.0))*lit*body*behind,0.95);
}

void main(){
  vec2 p=gl_FragCoord.xy/u_res.y;
  vec2 g=p*u_rows;
  id=floor(g);
  vec2 cf=fract(g)-0.5;
  h=hash(id+u_seed);
  h2=hash(id+vec2(41.0,17.0)+u_seed);
  t=u_time;
  lv=u_level;
  ts=mix(0.45,1.0,lv)*(1.0+0.2*u_charge);

  x=(id.x+0.5)/u_rows;
  source=max(u_head-u_edge*0.6,0.0);
  d=source-x;
  filled=max(source,1e-3);
  at=d/filled;

  // This cell's own course through the current event.
  grow=u_to>=u_from;
  delay=grow?h*u_timing.x:(1.0-h)*u_timing.z;
  dur=(grow?u_timing.y:u_timing.w)/(0.85+0.3*h);
  k=clamp((u_since-delay)/dur,0.0,1.0);
  float eased=grow?1.0-pow(1.0-k,3.0):k*k*(3.0-2.0*k);
  float base=mix(u_from,u_to,eased);
  // Each cell's front is a little early or late, but only while there is a
  // front at all: at zero there is nothing left to be early about.
  float reach=base<0.0005?0.0:max(base+(h-0.5)*0.05*smoothstep(0.0,0.12,base),0.0);
  extent=reach*filled;
  running=grow?1.0-k:0.0;

  across=abs(p.y-0.5)*2.0;
  body=pow(max(1.0-across*across*0.45,0.0),0.75);
  behind=smoothstep(-0.3,0.05,d);
  lit=smoothstep(0.0,0.08,max(u_to,base));

  if(u_mode<0.5)fireMode();
  else if(u_mode<1.5)synapseMode();
  else if(u_mode<2.5)frostMode();
  else planktonMode();

  // Each cell is a soft square.
  float half_=u_p.z*0.5;
  float cell=smoothstep(half_+0.06,half_-0.08,max(abs(cf.x)*0.92,abs(cf.y)));
  vec2 now=min(vec2(E,W)*cell*u_p.w,vec2(2.0));

  // Afterglow: light builds up over the last few frames and drains away.
  // The small subtraction lets it reach zero: on an 8-bit buffer a fading
  // value would otherwise round to the same faint step forever.
  vec2 last=max(texture(u_back,v_uv).rg*2.0*u_keep-vec2(3.0/255.0),vec2(0.0));
  vec2 result=max(now*0.8,last+now*(1.0-u_keep)*1.4);
  o=vec4(min(result*0.5,vec2(1.0)),0.0,1.0);
}`

export const BLUR = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_step;
uniform float u_threshold;
out vec4 o;
vec4 at(vec2 uv){
  vec4 c=texture(u_tex,uv);
  // First pass only: keep what is hot enough to glow.
  if(u_threshold>0.0){c*=smoothstep(u_threshold,u_threshold+0.25,c.r*2.0);}
  return c;
}
void main(){
  vec4 c=at(v_uv)*0.2270270270;
  c+=(at(v_uv+u_step*1.3846153846)+at(v_uv-u_step*1.3846153846))*0.3162162162;
  c+=(at(v_uv+u_step*3.2307692308)+at(v_uv-u_step*3.2307692308))*0.0702702703;
  o=c;
}`

export const COMPOSITE = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform sampler2D u_ramp;
uniform float u_dark;
uniform float u_bloomAmount;
uniform float u_time;
out vec4 o;
vec3 ramp(float heat){return texture(u_ramp,vec2(clamp(heat,0.0,1.0)*0.984+0.008,0.5)).rgb;}
float grain(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 scene=texture(u_scene,v_uv).rg*2.0;
  vec2 bloom=texture(u_bloom,v_uv).rg*2.0;
  float e=scene.x;
  float glow=bloom.x*u_bloomAmount;
  // A dim cell is a cool cell: faint light leans to the hue, never to grey.
  float heat=(e>0.002?scene.y/e:0.0)*mix(0.55,1.0,clamp(e*1.4,0.0,1.0));
  float glowHeat=bloom.x>0.002?bloom.y/bloom.x:0.0;
  vec3 color=ramp(heat);
  vec3 glowColor=ramp(glowHeat*0.9);

  // Dark rail: light adds up, then rolls off toward white.
  vec3 lit=1.0-exp(-(color*e+glowColor*glow*1.2+color*e*glow*0.35)*1.15);
  float litAlpha=max(max(lit.r,lit.g),lit.b);

  // Light rail: light is ink. Density becomes alpha, temperature becomes depth.
  float density=1.0-exp(-(e*1.5+glow*0.45));
  vec3 ink=mix(ramp(0.2+glowHeat*0.7),ramp(0.22+heat*0.78),clamp(e/(e+glow*0.5+0.001),0.0,1.0));

  vec4 result=mix(vec4(ink*density,density),vec4(lit,litAlpha),u_dark);
  // Dither, but only where there is light: an empty rail stays exactly empty.
  result.rgb+=(grain(gl_FragCoord.xy+fract(u_time)*61.0)-0.5)/255.0*step(0.004,result.a)*result.a;
  o=clamp(result,0.0,1.0);
}`

/** Modes the renderer can draw, in the order the shader numbers them. */
export const MODES = Object.freeze(['fire', 'synapse', 'frost', 'plankton'])
