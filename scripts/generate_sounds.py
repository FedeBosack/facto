import wave, struct, math, random

sampleRate = 16000 # Un punto medio, para retener algo de alta frecuencia en la lluvia y viento
duration = 300.0 # 5 Minutos (GAPLESS casi total en una sesión)
crossfade = 3.0 # Fusión suave en las extremidades
num_frames = int(sampleRate * duration)
crossfade_frames = int(sampleRate * crossfade)

def save_wav(filename, gen_func, is_noise=True):
    f = wave.open(filename, 'w')
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(sampleRate)
    
    total_frames = num_frames + (crossfade_frames if is_noise else 0)
    samples = []
    
    for i in range(total_frames):
        t = float(i) / sampleRate
        val = gen_func(i, t)
        samples.append(val)
        
    if is_noise:
        # Crossfade the end with the beginning
        for i in range(crossfade_frames):
            fade_out = samples[num_frames + i]
            fade_in = samples[i]
            ratio = float(i) / crossfade_frames
            # equal power crossfade
            samples[i] = fade_in * math.sqrt(ratio) + fade_out * math.sqrt(1.0 - ratio)
            
        samples = samples[:num_frames]
        
    # Clamp and convert
    final_samples = []
    for val in samples:
        val = max(min(val, 1.0), -1.0)
        final_samples.append(int(val * 32767))
        
    f.writeframesraw(struct.pack(f'<{len(final_samples)}h', *final_samples))
    f.close()
    print(f"Generated {filename}")

# 1. White Noise
save_wav('assets/sounds/focus_white.wav', lambda i, t: random.uniform(-0.5, 0.5), True)

# 2. Pink Noise
pink_state = [0]*7
def pink_gen(i, t):
    white = random.uniform(-0.5, 0.5)
    pink_state[0] = 0.99886 * pink_state[0] + white * 0.0555179
    pink_state[1] = 0.99332 * pink_state[1] + white * 0.0750759
    pink_state[2] = 0.96900 * pink_state[2] + white * 0.1538520
    pink_state[3] = 0.86650 * pink_state[3] + white * 0.3104856
    pink_state[4] = 0.55000 * pink_state[4] + white * 0.5329522
    pink_state[5] = -0.7616 * pink_state[5] - white * 0.0168980
    pink = sum(pink_state) + white * 0.5362
    return pink * 0.12
save_wav('assets/sounds/focus_pink.wav', pink_gen, True)

# 3. Brown Noise
brown_state = [0.0]
def brown_gen(i, t):
    white = random.uniform(-0.1, 0.1)
    brown_state[0] = (brown_state[0] + white) / 1.02
    return brown_state[0] * 3.5
save_wav('assets/sounds/focus_brown.wav', brown_gen, True)

# 4. Soft Rain (Pink + Brown with drops)
rain_state = [0.0]
def rain_gen(i, t):
    white = random.uniform(-0.1, 0.1)
    rain_state[0] = (rain_state[0] + white) / 1.04
    base = rain_state[0] * 2.5
    # Add drops
    if random.random() < 0.01:
        base += random.uniform(-0.3, 0.3)
    return base
save_wav('assets/sounds/focus_rain.wav', rain_gen, True)

# 5. Heavy Rain
heavy_state = [0.0]
def heavy_rain_gen(i, t):
    white = random.uniform(-0.1, 0.1)
    heavy_state[0] = (heavy_state[0] + white) / 1.02
    base = heavy_state[0] * 2.0 + random.uniform(-0.1, 0.1)
    if random.random() < 0.05:
        base += random.uniform(-0.4, 0.4)
    return base
save_wav('assets/sounds/focus_heavy_rain.wav', heavy_rain_gen, True)

# 6. Ocean Waves (Slow LFO on Brown/Pink noise)
ocean_state = [0.0]
def ocean_gen(i, t):
    white = random.uniform(-0.1, 0.1)
    ocean_state[0] = (ocean_state[0] + white) / 1.03
    # LFO period 8 seconds (matches duration perfectly)
    lfo = (math.sin(2 * math.pi * (1.0/8.0) * t) + 1.0) / 2.0 
    return ocean_state[0] * 4.0 * (0.2 + 0.8 * lfo)
save_wav('assets/sounds/focus_ocean.wav', ocean_gen, False) # LFO matches duration exactly, no fade needed, but noise needs it. Wait, noise needs crossfade.
# Actually, let's crossfade ocean anyway
save_wav('assets/sounds/focus_ocean.wav', ocean_gen, True)

# 7. Fireplace Crackle
def fire_gen(i, t):
    base = brown_gen(i, t) * 0.3
    if random.random() < 0.002: # Rare snaps
        base += random.uniform(-0.8, 0.8)
    if random.random() < 0.01: # Frequent pops
        base += random.uniform(-0.3, 0.3)
    return base
save_wav('assets/sounds/focus_fire.wav', fire_gen, True)

# 8. Night Wind
wind_state = [0.0]
def wind_gen(i, t):
    white = random.uniform(-0.1, 0.1)
    wind_state[0] = (wind_state[0] + white) / 1.05
    lfo = (math.sin(2 * math.pi * 0.125 * t) + 1.0) / 2.0 # 8 sec period
    return wind_state[0] * 3.0 * (0.4 + 0.6 * lfo)
save_wav('assets/sounds/focus_wind.wav', wind_gen, True)

# Pure Tones (No crossfade needed because frequencies match 1/8Hz integer multiples)
# 9. 432 Hz Healing (432 & 216)
save_wav('assets/sounds/focus_432hz.wav', lambda i, t: math.sin(2 * math.pi * 432.0 * t) * 0.3 + math.sin(2 * math.pi * 216.0 * t) * 0.2, False)

# 10. 528 Hz Focus (528 & 264)
save_wav('assets/sounds/focus_528hz.wav', lambda i, t: math.sin(2 * math.pi * 528.0 * t) * 0.3 + math.sin(2 * math.pi * 264.0 * t) * 0.2, False)

# 11. Deep Space Drone (45, 50, 55 Hz) -> All integers. 
save_wav('assets/sounds/focus_space.wav', lambda i, t: (math.sin(2*math.pi*45.0*t) + math.sin(2*math.pi*50.0*t) + math.sin(2*math.pi*55.0*t)) * 0.2, False)

# 12. Alpha Binaural (200Hz base + 210Hz) -> 10Hz difference
save_wav('assets/sounds/focus_alpha.wav', lambda i, t: (math.sin(2*math.pi*200.0*t) + math.sin(2*math.pi*210.0*t)) * 0.25, False)

# 13. Theta Binaural (200Hz base + 206Hz) -> 6Hz difference
save_wav('assets/sounds/focus_theta.wav', lambda i, t: (math.sin(2*math.pi*200.0*t) + math.sin(2*math.pi*206.0*t)) * 0.25, False)
