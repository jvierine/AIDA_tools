function ask_keo_n_movie_maker(event_files,do_plot_keos,make_movie)
%
% 
% Calling:
%  ask_keo_n_movie_maker(event_files,do_plot_keos,make_movie)
% Input:
%  event_files  - 
%  do_plot_keos - 
%  make_movie   - 
% Example:
%  event_files = ['20061022224400r1.txt';'20061022224400r3.txt'];
%  do_plot_keos = 1;
%  make_movie = 0;
%  ask_keo_n_movie_maker(event_files,do_plot_keos,make_movie)



%% This is for initializing work and should be put to example script
% wpwd = pwd;
% cd /home/bgu001AIDA_tools/
% AIDA_startup
% cd(wpwd)
global vs
ASK_site_init


% ASK_read_vs(1,['20061022224400r1.txt'])
ASK_read_vs(1,event_files)

% ftsz_lab = 14;
% ftsz_ax  = 12;
OPS4keo = ASK_keogram_overlayed;
OPS4keo.filtertype = {'medfilt2'};
OPS4keo.filterArgs = {{[3 3],'symmetric'}};
OPS4keo.subplot4imgs = [3,9,1];
OPS4keo.subplot4ASK1keo = [3,1,2];
OPS4keo.subplot4ASK3keo = [3,1,3];
OPS4keo.subplot4ASK2keo = [];
OPS4keo.subplot4RGBkeo = [];
OPS4keo.oneImg = 1;
% Suitable filter-kernel for noise-reduction
fK = [.25 .75 1 .75 .25]/3;
fK2 = fK'*fK;
OPS4imseq       = ASK_images2movie;
OPS4imseq.imdisplay = 1;
OPS4imseq.outargtype = 'imgstack';
filter_in_ask_read_v = 1;
if filter_in_ask_read_v
  OPS4imseq.filtertype = {'medfilt2'}; % wiener2
  OPS4imseq.filterArgs = {{[3 3],'symmetric'}}; % {{[3 3]}};   %
  OPS4imseq.filterkernel = {[], [], []}; % {fK2, fK2, fK2};
else
  OPS4imseq.filtertype = {'none'}; 
  OPS4imseq.filterArgs = {{[]}};
  OPS4imseq.filterkernel = {fK2, fK2, fK2};
end
% time_s = ASK_indx2datevec(32);
% time_e = ASK_indx2datevec(vs.vnl-32);

% t_lims = [2006 10 22 22 44 0;2006 10 22 23 4 0];
% t_lims = [time_s;time_e];
% idx_pulsations = ASK_time2indx(t_lims);
% Index starting one second after mega-block start ending 1 s before end
% idx_pulsations = [ceil(1/vs.vres),vs.vnl-ceil(1/vs.vres)];
% Index starting one second after mega-block start ending 1 s before end
idx_full= [1,vs.vnl];

if do_plot_keos
  figure('position',[300 374 940 420])
  [keo,imstack,timeV] = ASK_keogram_overlayed(idx_full(1),...        
                                              idx_full(2),...     
                                              1,...
                                              [0 0 0],...
                                              5,...
                                              127,...
                                              127,...
                                              90,...
                                              OPS4keo);
  for i1 = numel(keo):-1:1
    Keo = keo{i1};
    [~,f_name,~] = fileparts(event_files(min(end,i1),:));
    savename = fullfile([f_name,'.mat']);
    save(savename,'Keo','timeV','imstack','event_files')
  end
else
  % for i1 = 1
  ASK_v_select(1)
  [Keo,timeV] = ASK_keogram(1,...
                            idx_full(1),...
                            idx_full(2),...
                            1,...
                            5,...
                            127,...
                            127,...
                            90,...
                            0,...
                            OPS4keo);
  [~,f_name,~] = fileparts(event_files);
  savename = fullfile([f_name,'.mat']);
  save(savename,'Keo','timeV','event_files')
  % end
  
  % end
end

if make_movie
  ASK_v_select(1)
  cax = imgs_smart_caxis(0.001,Keo);
  cax(1) = 0;
  OPS4imseq.caxis{1} = cax;
  m_name = [f_name,'.avi'];
  figure('Name','movie-window',...
         'Position',[280 258 360 350],...
         'Colormap',bone)
  ASK_images2movie(idx_full(1):idx_full(2),1,m_name,OPS4imseq)
  % ASK_read_v(i1,0,0,nocnv,OPS4imseq);
end
end
