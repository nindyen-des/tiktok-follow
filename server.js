const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        status: 'error',
        message: 'Too many requests, please try again later.'
    }
});
app.use('/api/', limiter);

// Store active boosts
const activeBoosts = new Map();

class TiktokBoosterAPI {
    constructor() {
        this.baseUrl = "https://zefame-free.com/api_free.php";
        this.proxyUrl = "https://zefame-free.com/tiktok_proxy.php";
        this.headers = {
            "accept": "application/json, text/javascript, */*; q=0.01",
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": "en-US,en;q=0.9,fil;q=0.8",
            "origin": "https://zefame.com",
            "referer": "https://zefame.com/",
            "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
        };
    }

    extractUsername(url) {
        try {
            const match = url.match(/tiktok\.com\/@([^\/?]+)/);
            return match ? match[1] : null;
        } catch (error) {
            return null;
        }
    }

    async checkProfile(url) {
        try {
            const username = this.extractUsername(url);
            if (!username) {
                return {
                    status: 'error',
                    message: 'Invalid TikTok URL. Use format: https://tiktok.com/@username'
                };
            }

            const params = { username };
            const headers = { ...this.headers, "accept": "*/*" };
            
            const response = await axios.get(this.proxyUrl, { headers, params, timeout: 10000 });
            const data = response.data;

            if (data.statusCode === 0 || data.status_code === 0 || data.userInfo) {
                const userInfo = data.userInfo?.user || {};
                return {
                    status: 'success',
                    username: `@${username}`,
                    nickname: userInfo.nickname || 'N/A',
                    followers: data.userInfo?.stats?.followerCount || 0,
                    following: data.userInfo?.stats?.followingCount || 0,
                    verified: true
                };
            }

            return {
                status: 'error',
                message: 'Profile not found or private'
            };

        } catch (error) {
            return {
                status: 'error',
                message: 'Failed to check profile'
            };
        }
    }

    async startBoost(username, url, duration = 0) {
        try {
            const boostId = uuidv4();
            const startTime = new Date();
            
            // If duration is 0, make it unlimited (simulated)
            const endTime = duration > 0 ? 
                new Date(startTime.getTime() + duration * 60000) : 
                null;

            // Store boost session
            const boostData = {
                id: boostId,
                username: `@${username}`,
                url,
                startTime,
                endTime,
                duration: duration > 0 ? duration : 'unlimited',
                status: 'active',
                followersAdded: 0,
                progress: 0,
                lastUpdate: startTime
            };

            activeBoosts.set(boostId, boostData);

            // Start background simulation
            this.simulateUnlimitedBoost(boostId);

            return {
                status: 'success',
                message: 'Boost started successfully',
                boostId,
                username: `@${username}`,
                startTime: startTime.toISOString(),
                endTime: endTime ? endTime.toISOString() : null,
                duration: duration > 0 ? `${duration} minutes` : 'unlimited',
                checkStatus: `/api/status/${boostId}`
            };

        } catch (error) {
            return {
                status: 'error',
                message: 'Failed to start boost'
            };
        }
    }

    simulateUnlimitedBoost(boostId) {
        // Unlimited simulation - keeps going until stopped
        const interval = setInterval(() => {
            const boost = activeBoosts.get(boostId);
            
            if (!boost || boost.status === 'stopped' || boost.status === 'completed') {
                clearInterval(interval);
                return;
            }

            // If has end time and expired, complete it
            if (boost.endTime && new Date() > boost.endTime) {
                boost.status = 'completed';
                boost.progress = 100;
                clearInterval(interval);
                return;
            }

            // Update followers (random increase)
            const followersToAdd = Math.floor(Math.random() * 50) + 10;
            boost.followersAdded += followersToAdd;
            boost.lastUpdate = new Date();
            
            // Update progress if not unlimited
            if (boost.duration !== 'unlimited' && boost.endTime) {
                const totalTime = boost.endTime - boost.startTime;
                const elapsed = new Date() - boost.startTime;
                boost.progress = Math.min(100, Math.floor((elapsed / totalTime) * 100));
            }

            activeBoosts.set(boostId, boost);
        }, 5000); // Update every 5 seconds
    }

    stopBoost(boostId) {
        const boost = activeBoosts.get(boostId);
        if (!boost) {
            return {
                status: 'error',
                message: 'Boost not found'
            };
        }

        boost.status = 'stopped';
        boost.endTime = new Date();
        activeBoosts.set(boostId, boost);

        return {
            status: 'success',
            message: 'Boost stopped successfully',
            boostId,
            username: boost.username,
            totalFollowersAdded: boost.followersAdded,
            duration: `${Math.round((boost.endTime - boost.startTime) / 60000)} minutes`,
            stoppedAt: boost.endTime.toISOString()
        };
    }

    getBoostStatus(boostId) {
        const boost = activeBoosts.get(boostId);
        if (!boost) {
            return {
                status: 'error',
                message: 'Boost not found'
            };
        }

        const now = new Date();
        let timeRemaining = null;
        
        if (boost.endTime) {
            const remainingMs = boost.endTime - now;
            timeRemaining = remainingMs > 0 ? 
                `${Math.ceil(remainingMs / 60000)} minutes` : 
                'Completed';
        } else {
            timeRemaining = 'Unlimited (running)';
        }

        const elapsedMs = now - boost.startTime;
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

        return {
            status: 'success',
            boostId,
            username: boost.username,
            status: boost.status,
            followersAdded: boost.followersAdded,
            progress: boost.progress,
            timeRemaining,
            elapsed: `${elapsedMinutes}m ${elapsedSeconds}s`,
            startTime: boost.startTime.toISOString(),
            endTime: boost.endTime ? boost.endTime.toISOString() : null,
            lastUpdate: boost.lastUpdate.toISOString()
        };
    }

    getAllBoosts() {
        const boosts = Array.from(activeBoosts.values()).map(boost => {
            const now = new Date();
            const elapsedMs = now - boost.startTime;
            const elapsedMinutes = Math.floor(elapsedMs / 60000);
            
            return {
                id: boost.id,
                username: boost.username,
                status: boost.status,
                followersAdded: boost.followersAdded,
                progress: boost.progress,
                elapsed: `${elapsedMinutes} minutes`,
                startTime: boost.startTime.toISOString()
            };
        });

        return {
            status: 'success',
            totalBoosts: boosts.length,
            activeBoosts: boosts.filter(b => b.status === 'active').length,
            boosts
        };
    }

    cleanupOldBoosts() {
        const now = new Date();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        
        for (const [boostId, boost] of activeBoosts.entries()) {
            const age = now - boost.startTime;
            if (age > twentyFourHours) {
                activeBoosts.delete(boostId);
            }
        }
    }
}

// Initialize API
const tiktokAPI = new TiktokBoosterAPI();

// Cleanup old boosts every hour
setInterval(() => {
    tiktokAPI.cleanupOldBoosts();
}, 60 * 60 * 1000);

// API Documentation - GET /
app.get('/', (req, res) => {
    res.json({
        service: 'TikTok Followers Booster API',
        version: '2.0',
        description: 'Boost TikTok followers with unlimited time simulation',
        endpoints: [
            {
                method: 'GET',
                path: '/api/check',
                description: 'Check TikTok profile',
                parameters: '?url=TIKTOK_URL',
                example: '/api/check?url=https://tiktok.com/@username'
            },
            {
                method: 'GET',
                path: '/api/boost/start',
                description: 'Start followers boost',
                parameters: '?url=TIKTOK_URL&duration=MINUTES',
                example: '/api/boost/start?url=https://tiktok.com/@username&duration=60'
            },
            {
                method: 'GET',
                path: '/api/status/:boostId',
                description: 'Check boost status',
                example: '/api/status/12345678-1234-1234-1234-123456789012'
            },
            {
                method: 'GET',
                path: '/api/boost/stop/:boostId',
                description: 'Stop a boost',
                example: '/api/boost/stop/12345678-1234-1234-1234-123456789012'
            },
            {
                method: 'GET',
                path: '/api/boosts',
                description: 'List all active boosts',
                example: '/api/boosts'
            }
        ],
        note: 'Set duration=0 for unlimited boost'
    });
});

// Check profile - GET /api/check
app.get('/api/check', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing URL parameter. Use: /api/check?url=https://tiktok.com/@username'
            });
        }

        if (!url.includes('tiktok.com')) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid TikTok URL. Must contain "tiktok.com"'
            });
        }

        const result = await tiktokAPI.checkProfile(url);
        res.json(result);

    } catch (error) {
        console.error('Check error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
});

// Start boost - GET /api/boost/start
app.get('/api/boost/start', async (req, res) => {
    try {
        const { url, duration = 60 } = req.query; // Default 60 minutes
        
        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing URL parameter. Use: /api/boost/start?url=URL&duration=MINUTES'
            });
        }

        if (!url.includes('tiktok.com')) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid TikTok URL'
            });
        }

        const username = tiktokAPI.extractUsername(url);
        if (!username) {
            return res.status(400).json({
                status: 'error',
                message: 'Could not extract username from URL'
            });
        }

        const durationNum = parseInt(duration);
        if (isNaN(durationNum) || durationNum < 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Duration must be a positive number (0 for unlimited)'
            });
        }

        const result = await tiktokAPI.startBoost(username, url, durationNum);
        res.json(result);

    } catch (error) {
        console.error('Start boost error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
});

// Check status - GET /api/status/:boostId
app.get('/api/status/:boostId', (req, res) => {
    try {
        const { boostId } = req.params;
        const result = tiktokAPI.getBoostStatus(boostId);
        
        if (result.status === 'error') {
            return res.status(404).json(result);
        }
        
        res.json(result);

    } catch (error) {
        console.error('Status error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
});

// Stop boost - GET /api/boost/stop/:boostId
app.get('/api/boost/stop/:boostId', (req, res) => {
    try {
        const { boostId } = req.params;
        const result = tiktokAPI.stopBoost(boostId);
        
        if (result.status === 'error') {
            return res.status(404).json(result);
        }
        
        res.json(result);

    } catch (error) {
        console.error('Stop error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
});

// List all boosts - GET /api/boosts
app.get('/api/boosts', (req, res) => {
    try {
        const result = tiktokAPI.getAllBoosts();
        res.json(result);

    } catch (error) {
        console.error('Boosts error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
});

// Health check - GET /api/health
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeBoosts: activeBoosts.size,
        uptime: process.uptime()
    });
});

// Error handling
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Endpoint not found'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 TikTok Followers Booster API running on port ${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/`);
    console.log(`🔧 Example: http://localhost:${PORT}/api/check?url=https://tiktok.com/@username`);
});

module.exports = { app, tiktokAPI };
