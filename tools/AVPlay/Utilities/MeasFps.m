classdef MeasFps < matlab.System
    %
    % System objects to measure frame rate
    % Insert this system object within a video processing loop
    %
    % Takuya Otani
    % takuya.otani@mathworks.co.jp
    %
    % Copyright The MathWorks 2013.
    
    properties (Nontunable)
       AveragingCount = 10; % default to averaging 10 frames to calculate fps
    end
    
    properties
       Count;
       time;
       fps;
    end
       
    methods
        function obj = MeasFps(varargin)
            % Support name-value pair arguments
            setProperties(obj,nargin,varargin{:});
        end
    end
    
    methods (Access=protected)
        function setupImpl(obj)
            % Reset all variables to zeros
            obj.Count = 0;
            obj.time = uint64(0);
            obj.fps = single(0);
        end

        function y = stepImpl(obj)
            % Implement System algorithm. Calculate y as a function of
            % input u and state.                         
            
            if (obj.Count == 0) % Force initial fps to zero
                obj.fps = single(0);
                obj.time = tic();
            else
                if mod(obj.Count, obj.AveragingCount) == 0
                    t           = toc(obj.time);           % Get elapsed time
                    obj.fps   = single(obj.AveragingCount/t); % Output fps
                    obj.time = tic();
                end                
            end
            
            obj.Count = obj.Count + 1;
                        
            y = obj.fps;
        end
        
        function N = getNumInputsImpl(obj)
            % Specify number of System inputs
            N = 0; % Because stepImpl has one argument beyond obj
        end
        
        function N = getNumOutputsImpl(obj)
            % Specify number of System outputs
            N = 1; % Because stepImpl has one output
        end
    end
end

