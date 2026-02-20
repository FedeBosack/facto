import wave, struct, math, random

sampleRate = 22050
duration = 4.0 # 4 seconds to keep it small; will loop perfectly in HTML
num_frames = int(sampleRate * duration)

def save_wav(filename, gen_func):
    f = wave.open(filename, 'w')
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(sampleRate)
    
    # Generate all frames
    samples = []
    for i in range(num_frames):
        t = float(i) / sampleRate
        val = gen_func(i, t)
        # clamp
        val = max(min(val, 1.0), -1.0)
        samples.append(int(val * 32767))
        
    f.writeframesraw(struct.pack(f'<{len(samples)}h', *samples))
    f.close()
    print(f"Generated {filename}")

# 1. White Noise
save_wav('focus_white.wav', lambda i, t: random.uniform(-0.5, 0.5))

# 2. Pink Noise (approximation)
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
    return pink * 0.1
save_wav('focus_pink.wav', pink_gen)

# 3. Brown Noise
brown_state = [0.0]
def brown_gen(i, t):
    white = random.uniform(-0.1, 0.1)
    brown_state[0] = (brown_state[0] + white) / 1.02
    return brown_state[0] * 3.0
save_wav('focus_brown.wav', brown_gen)

# 4. Rain (Brown noise with envelope spikes)
rain_state = [0.0]
def rain_gen(i, t):
    white = random.uniform(-0.1, 0.1)
    rain_state[0] = (rain_state[0] + white) / 1.05
    base = rain_state[0] * 2.5
    # Add random drops
    if random.random() < 0.005:
        base += random.uniform(-0.4, 0.4)
    return base
save_wav('focus_rain.wav', rain_gen)

# 5. Wind (Undulating brown noise)
wind_state = [0.0]
def wind_gen(i, t):
    white = random.uniform(-0.1, 0.1)
    wind_state[0] = (wind_state[0] + white) / 1.05
    # LFO
    lfo = (math.sin(2 * math.pi * 0.2 * t) + 1.0) / 2.0
    return wind_state[0] * 2.0 * (0.3 + 0.7 * lfo)
save_wav('focus_wind.wav', wind_gen)

# 6. 432 Hz Healing
save_wav('focus_432hz.wav', lambda i, t: math.sin(2 * math.pi * 432.0 * t) * 0.3 + math.sin(2 * math.pi * 216.0 * t) * 0.2)

# 7. 528 Hz Focus
save_wav('focus_528hz.wav', lambda i, t: math.sin(2 * math.pi * 528.0 * t) * 0.3 + math.sin(2 * math.pi * 264.0 * t) * 0.2)

# 8. Deep Space (drone)
save_wav('focus_space.wav', lambda i, t: (math.sin(2*math.pi*45.0*t) + math.sin(2*math.pi*50.0*t) + math.sin(2*math.pi*55.0*t)) * 0.2)

# 9. Alpha Binaural (Monaural beat) 200Hz base + 210Hz (10Hz difference)
save_wav('focus_alpha.wav', lambda i, t: (math.sin(2*math.pi*200.0*t) + math.sin(2*math.pi*210.0*t)) * 0.25)

# 10. Theta Binaural (Monaural beat) 200Hz base + 206Hz (6Hz difference)
save_wav('focus_theta.wav', lambda i, t: (math.sin(2*math.pi*200.0*t) + math.sin(2*math.pi*206.0*t)) * 0.25)

