function [OV_is_OK,Movie_log] = ALIS_overview_log_viewer(date_obs)
% ALIS_OVERVIEW_LOG_VIEWER - 
%   


Overview_dir = '/bigdata/alis/Overviews';

load(fullfile(Overview_dir,'overview_log.mat'),'ALIS_OVERVIEW_ok','ALIS_movie_log')

Movie_log = ALIS_movie_log{date_obs(1)-1990,...
                    date_obs(2),...
                    date_obs(3)};
OV_is_OK= ALIS_OVERVIEW_ok{date_obs(1)-1990,...
                    date_obs(2),...
                    date_obs(3)};

if ~isempty(OV_is_OK)
  disp(OV_is_OK)
  disp('-----------------------------------------')
  disp(Movie_log)
end