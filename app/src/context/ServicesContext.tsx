import React from 'react';
import { mlService } from '../services/mlService';
import { audioService } from '../services/audioService';
import { adaptiveLearningService } from '../services/adaptiveLearningService';

const services = { mlService, audioService, adaptiveLearningService };

export const ServicesContext = React.createContext(services);
